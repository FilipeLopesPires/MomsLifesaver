/**
 * Regression tests for services/web-sound.ts
 *
 * These protect the two platform bugs we hit on iOS web:
 *   1. iOS Safari/Chrome ignores HTMLMediaElement.volume. Volume must be
 *      applied via a Web Audio GainNode.
 *   2. Large audio files (e.g. 64 MB m4a) must not be decoded into memory
 *      with AudioBuffer / decodeAudioData - streaming via <audio> is required
 *      to avoid crashing the iOS tab.
 *
 * Also covers resilience guarantees relied on by use-audio-controller.ts.
 */

import { WebSound, WebSoundFactory } from '../web-sound';

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: (_module: unknown) => ({ uri: '/fixture.mp3', localUri: null }),
  },
}));

jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

type AudioMocks = {
  instances: Array<{
    state: 'suspended' | 'running';
    resume: jest.Mock<Promise<void>, []>;
    createGain: jest.Mock;
    createMediaElementSource: jest.Mock;
  }>;
  gainNodes: Array<{ gain: { value: number }; connect: jest.Mock; disconnect: jest.Mock }>;
  sourceNodes: Array<{ connect: jest.Mock; disconnect: jest.Mock }>;
  lastContext: () => AudioMocks['instances'][number] | undefined;
  reset: () => void;
};

const mocks = (globalThis as unknown as { __audioMocks: AudioMocks }).__audioMocks;
const installAudioContext = (
  globalThis as unknown as { __installAudioContext: () => void }
).__installAudioContext;

const trackedAudioInstances: HTMLAudioElement[] = [];
let OriginalAudio: typeof Audio;

const dispatchLoaded = (audio: HTMLAudioElement) => {
  Object.defineProperty(audio, 'readyState', { configurable: true, value: 4 });
  audio.dispatchEvent(new Event('loadeddata'));
};

const dispatchError = (audio: HTMLAudioElement, message = 'MEDIA_ERR_SRC_NOT_SUPPORTED') => {
  Object.defineProperty(audio, 'error', {
    configurable: true,
    value: { message, code: 4 },
  });
  audio.dispatchEvent(new Event('error'));
};

const lastAudio = (): HTMLAudioElement => {
  const audio = trackedAudioInstances[trackedAudioInstances.length - 1];
  if (!audio) throw new Error('No Audio instance created yet');
  return audio;
};

// Reset the module-level sharedContext between tests by re-importing the module.
const loadFreshModule = (): typeof import('../web-sound') => {
  let fresh!: typeof import('../web-sound');
  jest.isolateModules(() => {
    fresh = require('../web-sound');
  });
  return fresh;
};

beforeEach(() => {
  jest.clearAllMocks();
  mocks.reset();
  installAudioContext();
  trackedAudioInstances.length = 0;
  OriginalAudio = window.Audio;
  (window as unknown as { Audio: typeof Audio }).Audio = function AudioCtor(this: HTMLAudioElement) {
    const instance = new OriginalAudio();
    trackedAudioInstances.push(instance);
    return instance;
  } as unknown as typeof Audio;
  (globalThis as unknown as { Audio: typeof Audio }).Audio = (
    window as unknown as { Audio: typeof Audio }
  ).Audio;
});

afterEach(() => {
  (window as unknown as { Audio: typeof Audio }).Audio = OriginalAudio;
  (globalThis as unknown as { Audio: typeof Audio }).Audio = OriginalAudio;
  jest.restoreAllMocks();
});

describe('WebSound - non-iOS volume routing (regression guard)', () => {
  it('routes audio through MediaElementSource -> GainNode -> destination after load', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 0.5, isLooping: true, shouldPlay: false });

    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    const ctx = mocks.lastContext();
    expect(ctx).toBeDefined();
    expect(ctx!.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(ctx!.createMediaElementSource).toHaveBeenCalledWith(lastAudio());
    expect(ctx!.createGain).toHaveBeenCalledTimes(1);

    const source = mocks.sourceNodes[0];
    const gain = mocks.gainNodes[0];
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(
      expect.objectContaining({ __isDestination: true }),
    );
  });

  it('setVolumeAsync writes to GainNode.gain.value, NOT HTMLAudioElement.volume', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    await sound.setVolumeAsync(0.3);

    const gain = mocks.gainNodes[0];
    expect(gain.gain.value).toBeCloseTo(0.3, 5);
    // Element volume must stay at 1 because iOS Safari ignores this value anyway.
    expect(lastAudio().volume).toBe(1);
  });

  it('setVolumeAsync clamps values to the [0, 1] range', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    await sound.setVolumeAsync(-2);
    expect(mocks.gainNodes[0].gain.value).toBe(0);

    await sound.setVolumeAsync(5);
    expect(mocks.gainNodes[0].gain.value).toBe(1);
  });

  it('falls back to element.volume when Web Audio is unavailable', async () => {
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext = undefined;
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
      undefined;

    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    await sound.setVolumeAsync(0.4);
    expect(lastAudio().volume).toBeCloseTo(0.4, 5);
  });
});

describe('WebSound - streaming (memory regression guard)', () => {
  it('uses <audio> streaming, never decodeAudioData or createBuffer', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    const ctx = mocks.lastContext() as unknown as Record<string, unknown>;
    expect(ctx.decodeAudioData).toBeUndefined();
    expect(ctx.createBuffer).toBeUndefined();
    expect(ctx.createBufferSource).toBeUndefined();
    expect(trackedAudioInstances).toHaveLength(1);
  });

  it('sets preload=auto and loop on the element so streaming is enabled', () => {
    const { WebSound: Fresh } = loadFreshModule();
    new Fresh(1, { volume: 1, isLooping: true, shouldPlay: false });
    const audio = lastAudio();
    expect(audio.preload).toBe('auto');
    expect(audio.loop).toBe(true);
    expect(audio.crossOrigin).toBe('anonymous');
  });
});

describe('WebSound - iOS background playback', () => {
  const IOS_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

  beforeEach(() => {
    // userAgent lives on Navigator.prototype as a getter; redefine on
    // the instance to override, then delete in afterEach to restore.
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      get: () => IOS_UA,
    });
  });

  afterEach(() => {
    delete (window.navigator as unknown as { userAgent?: string }).userAgent;
  });

  it('does NOT route through Web Audio on iOS (no MediaElementSource, no GainNode)', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 0.5, isLooping: true, shouldPlay: false });

    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    const ctx = mocks.lastContext();
    if (ctx) {
      expect(ctx.createMediaElementSource).not.toHaveBeenCalled();
      expect(ctx.createGain).not.toHaveBeenCalled();
    }
    expect(mocks.gainNodes).toHaveLength(0);
    expect(mocks.sourceNodes).toHaveLength(0);
  });

  it('setVolumeAsync writes to HTMLAudioElement.volume on iOS', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    await sound.setVolumeAsync(0.3);

    expect(lastAudio().volume).toBeCloseTo(0.3, 5);
    expect(mocks.gainNodes).toHaveLength(0);
  });

  it('playAsync does not call AudioContext.resume on iOS', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    const playSpy = jest.spyOn(HTMLMediaElement.prototype, 'play');
    await sound.playAsync();

    const ctx = mocks.lastContext();
    if (ctx) {
      expect(ctx.resume).not.toHaveBeenCalled();
    }
    expect(playSpy).toHaveBeenCalled();
  });

  it('sets playsInline on every audio element', () => {
    const { WebSound: Fresh } = loadFreshModule();
    new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    const audio = lastAudio();
    expect(audio.playsInline).toBe(true);
    expect(audio.getAttribute('playsinline')).not.toBeNull();
  });
});

describe('WebSound - iOS AudioContext unlock', () => {
  it('playAsync resumes a suspended AudioContext before calling audio.play', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    dispatchLoaded(lastAudio());
    await sound.whenLoaded();

    const ctx = mocks.lastContext()!;
    expect(ctx.state).toBe('suspended');

    const playSpy = jest.spyOn(HTMLMediaElement.prototype, 'play');
    await sound.playAsync();

    expect(ctx.resume).toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalled();
    expect(ctx.state).toBe('running');
  });
});

describe('WebSound - resilience', () => {
  it('loadedPromise resolves (does not reject) when the element errors', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });

    dispatchError(lastAudio());
    await expect(sound.whenLoaded()).resolves.toBeUndefined();
  });

  it('playAsync after a load error is a no-op (does not throw, does not play)', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });
    dispatchError(lastAudio());
    await sound.whenLoaded();

    // After an error the sound must report itself as not loaded. This is
    // what use-audio-controller.ts relies on to skip unusable tracks.
    const status = await sound.getStatusAsync();
    expect(status.isLoaded).toBe(false);

    const playSpy = jest.spyOn(HTMLMediaElement.prototype, 'play');
    await expect(sound.playAsync()).resolves.toBeUndefined();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('getStatusAsync reports isLoaded=false before the element is ready', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });

    const status = await sound.getStatusAsync();
    expect(status.isLoaded).toBe(false);
    expect(status.positionMillis).toBe(0);
    expect(status.isPlaying).toBe(false);
  });

  it('queued setPositionAsync waits for load and then applies the seek', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });

    const seekPromise = sound.setPositionAsync(2500);
    dispatchLoaded(lastAudio());
    await seekPromise;

    expect(lastAudio().currentTime).toBeCloseTo(2.5, 5);
  });
});

describe('WebSoundFactory.createAsync', () => {
  it('returns a sound handle synchronously without awaiting load', async () => {
    const { WebSoundFactory: Fresh } = loadFreshModule();

    const result = await Fresh.createAsync(1, {
      volume: 1,
      isLooping: false,
      shouldPlay: false,
    });

    expect(result.sound).toBeDefined();
    // Element is created but not yet loaded; state reflects that.
    expect((await result.sound.getStatusAsync()).isLoaded).toBe(false);
  });

  it('does not crash when one sound fails to load while others succeed', async () => {
    const { WebSoundFactory: Fresh } = loadFreshModule();

    const broken = await Fresh.createAsync(1, { volume: 1, isLooping: false, shouldPlay: false });
    const brokenEl = lastAudio();
    dispatchError(brokenEl);

    const ok = await Fresh.createAsync(2, { volume: 1, isLooping: false, shouldPlay: false });
    const okEl = lastAudio();
    dispatchLoaded(okEl);

    await Promise.all([broken.sound.whenLoaded(), ok.sound.whenLoaded()]);

    expect((await broken.sound.getStatusAsync()).isLoaded).toBe(false);
    expect((await ok.sound.getStatusAsync()).isLoaded).toBe(true);
  });
});

describe('WebSound - silent touches do not break the API contract', () => {
  it('setVolumeAsync is safe before load (no crash, no GainNode touch)', async () => {
    const { WebSound: Fresh } = loadFreshModule();
    const sound = new Fresh(1, { volume: 1, isLooping: false, shouldPlay: false });

    await expect(sound.setVolumeAsync(0.7)).resolves.toBeUndefined();
    expect(mocks.gainNodes).toHaveLength(0);
    // Element volume is updated as the fallback pre-load path.
    expect(lastAudio().volume).toBeCloseTo(0.7, 5);
  });
});
