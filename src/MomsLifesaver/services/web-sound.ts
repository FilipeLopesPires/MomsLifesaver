/**
 * Web-only replacement for `expo-av`'s `Audio.Sound`.
 *
 * Wraps an `HTMLAudioElement` and exposes the subset of the `Sound`
 * API that `useAudioController` relies on: `playAsync`, `pauseAsync`,
 * `stopAsync`, `setVolumeAsync`, `setPositionAsync`, `getStatusAsync`,
 * and `unloadAsync`.
 *
 * Two volume strategies are used depending on the platform:
 *
 *   - Non-iOS (Android Chrome, desktop browsers): the element is routed
 *     through a shared Web `AudioContext` + `GainNode` so volume can be
 *     controlled cleanly. This was originally added because pre-16.4
 *     Mobile Safari ignored `HTMLAudioElement.volume`.
 *
 *   - iOS Safari / iOS Chrome: the Web Audio routing is skipped and
 *     volume is written directly to `HTMLAudioElement.volume`. iOS
 *     intentionally suspends any `AudioContext` whose owning page is
 *     hidden or whose device screen is locked, which broke background
 *     playback. Bypassing the AudioContext is the only way to keep
 *     audio alive in the background and surface it on the lock screen
 *     via the Media Session API. iOS 16.4+ honors element volume; on
 *     older iOS the slider has no audible effect (acceptable
 *     trade-off in exchange for working background playback).
 */
import { Asset } from 'expo-asset';

import { log, logError } from '@/utils/logger';

type CreateOptions = {
  volume?: number;
  isLooping?: boolean;
  shouldPlay?: boolean;
  /** Ignored on web; kept for API parity with NativeSoundFactory. */
  debugLabel?: string;
};

type PlaybackStatus = {
  isLoaded: boolean;
  positionMillis: number;
  durationMillis?: number;
  isPlaying: boolean;
};

const resolveUri = (audioModule: unknown): string => {
  if (typeof audioModule === 'string') {
    return audioModule;
  }

  if (audioModule && typeof audioModule === 'object') {
    const candidate = audioModule as { uri?: string; default?: string };
    if (typeof candidate.uri === 'string') {
      return candidate.uri;
    }
    if (typeof candidate.default === 'string') {
      return candidate.default;
    }
  }

  const asset = Asset.fromModule(audioModule as number);
  const uri = asset.uri ?? asset.localUri;
  if (!uri) {
    throw new Error('[MomsLifesaver] Could not resolve audio module to URI');
  }
  return uri;
};

/**
 * Shared AudioContext. We only create one per tab and route every track's
 * MediaElementSource through it so iOS honors volume via GainNode.
 */
type ACWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

const isIOSWeb = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac; disambiguate via touch points.
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return ua.includes('Mac') && typeof document !== 'undefined' && (nav.maxTouchPoints ?? 0) > 1;
};

let sharedContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (sharedContext) return sharedContext;
  const Ctor = (window as ACWindow).AudioContext ?? (window as ACWindow).webkitAudioContext;
  if (!Ctor) return null;
  sharedContext = new Ctor();
  return sharedContext;
};

const resumeAudioContext = async (): Promise<void> => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (error) {
      logError('[MomsLifesaver] AudioContext resume failed:', error);
    }
  }
};

export class WebSound {
  private audio: HTMLAudioElement;
  private uri: string;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private loadedPromise: Promise<void>;
  private loadError: Error | null = null;
  private pendingVolume: number;
  private wantsToPlay = false;

  constructor(audioModule: unknown, options: CreateOptions) {
    this.uri = resolveUri(audioModule);
    this.pendingVolume = options.volume ?? 1;

    log('[MomsLifesaver] WebSound creating audio element for:', this.uri);

    const audio = new Audio();
    audio.src = this.uri;
    audio.loop = options.isLooping ?? false;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    // playsInline is required on iOS so the element doesn't get punted to
    // the native fullscreen player and so it participates in the page's
    // media session (kept alive when the tab is hidden / screen locked).
    // The property is typed on HTMLVideoElement only, but iOS Safari also
    // honors it on HTMLAudioElement.
    (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.volume = isIOSWeb() ? this.pendingVolume : 1;
    this.audio = audio;

    this.loadedPromise = new Promise<void>((resolve) => {
      const onReady = () => {
        log('[MomsLifesaver] WebSound loaded:', this.uri);
        this.setupWebAudioRouting();
        resolve();
      };
      if (audio.readyState >= 2) {
        onReady();
        return;
      }
      audio.addEventListener('loadeddata', onReady, { once: true });
      audio.addEventListener('error', () => {
        const err = new Error(`Failed to load audio ${this.uri}: ${audio.error?.message ?? 'unknown'}`);
        logError('[MomsLifesaver] WebSound load error:', this.uri, audio.error);
        this.loadError = err;
        resolve();
      }, { once: true });
    });

    audio.load();

    if (options.shouldPlay) {
      this.wantsToPlay = true;
      this.loadedPromise.then(() => {
        if (this.wantsToPlay) {
          this.playNow();
        }
      });
    }
  }

  private setupWebAudioRouting(): void {
    if (this.sourceNode) return;
    // iOS suspends Web Audio when the page is hidden or screen locked,
    // which kills background playback. Skip routing on iOS and let the
    // <audio> element drive output directly.
    if (isIOSWeb()) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      this.sourceNode = ctx.createMediaElementSource(this.audio);
      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = this.pendingVolume;
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(ctx.destination);
      // From here the GainNode is the single attenuation stage. Any
      // setVolumeAsync that landed before routing existed took the
      // `else` branch and wrote the value to the element as well, so
      // without this reset the volume would be applied twice
      // (0.7 element x 0.7 gain = 0.49 output). pendingVolume already
      // carries the value, so clearing the element loses nothing.
      //
      // This MUST stay below the isIOSWeb() guard above: iOS skips
      // routing entirely and relies on element volume being the real
      // control, so resetting it there would mute the sliders.
      this.audio.volume = 1;
    } catch (error) {
      logError('[MomsLifesaver] WebSound failed to wire Web Audio routing:', this.uri, error);
    }
  }

  private playNow(): void {
    if (!isIOSWeb()) {
      resumeAudioContext();
    }
    this.audio.play().catch((error) => {
      logError('[MomsLifesaver] WebSound play error:', this.uri, error);
    });
  }

  async whenLoaded(): Promise<void> {
    return this.loadedPromise;
  }

  async playAsync(): Promise<void> {
    this.wantsToPlay = true;
    await this.loadedPromise;
    if (this.loadError) {
      logError('[MomsLifesaver] WebSound not usable (load failed):', this.uri);
      return;
    }
    this.playNow();
  }

  async pauseAsync(): Promise<void> {
    this.wantsToPlay = false;
    this.audio.pause();
  }

  async stopAsync(): Promise<void> {
    this.wantsToPlay = false;
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch {
      // some browsers throw if not yet seekable
    }
  }

  async setVolumeAsync(value: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, value));
    this.pendingVolume = clamped;
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    } else {
      this.audio.volume = clamped;
    }
  }

  async setPositionAsync(positionMillis: number): Promise<void> {
    await this.loadedPromise;
    if (this.loadError) return;
    try {
      this.audio.currentTime = positionMillis / 1000;
    } catch (error) {
      logError('[MomsLifesaver] WebSound seek error:', this.uri, error);
    }
  }

  async setIsLoopingAsync(isLooping: boolean): Promise<void> {
    this.audio.loop = isLooping;
  }

  async getStatusAsync(): Promise<PlaybackStatus> {
    const isLoaded = this.audio.readyState >= 2 && !this.loadError;
    if (!isLoaded) {
      return {
        isLoaded: false,
        positionMillis: 0,
        isPlaying: false,
      };
    }
    const duration = this.audio.duration;
    return {
      isLoaded: true,
      positionMillis: this.audio.currentTime * 1000,
      durationMillis: Number.isFinite(duration) && duration > 0 ? duration * 1000 : undefined,
      isPlaying: !this.audio.paused,
    };
  }

  async unloadAsync(): Promise<void> {
    try {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      if (this.sourceNode) {
        try { this.sourceNode.disconnect(); } catch { /* noop */ }
      }
      if (this.gainNode) {
        try { this.gainNode.disconnect(); } catch { /* noop */ }
      }
    } catch (error) {
      logError('[MomsLifesaver] WebSound unload error:', error);
    }
  }
}

export const WebSoundFactory = {
  createAsync: async (
    audioModule: unknown,
    options: CreateOptions,
  ): Promise<{ sound: WebSound }> => {
    const sound = new WebSound(audioModule, options);
    return { sound };
  },
};
