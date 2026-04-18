import { Asset } from 'expo-asset';

import { log, logError } from '@/utils/logger';

type CreateOptions = {
  volume?: number;
  isLooping?: boolean;
  shouldPlay?: boolean;
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
    audio.volume = 1;
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
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      this.sourceNode = ctx.createMediaElementSource(this.audio);
      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = this.pendingVolume;
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(ctx.destination);
    } catch (error) {
      logError('[MomsLifesaver] WebSound failed to wire Web Audio routing:', this.uri, error);
    }
  }

  private playNow(): void {
    resumeAudioContext();
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
