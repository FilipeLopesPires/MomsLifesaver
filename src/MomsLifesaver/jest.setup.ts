/**
 * Jest setup shared across tests.
 *
 * jsdom does not implement the Web Audio API and its HTMLAudioElement is a
 * stub. We install minimal mocks here so WebSound can run headless.
 *
 * Tests can inspect the mocks by reading globals set on `globalThis.__audioMocks`.
 */

type MockGainNode = {
  gain: { value: number };
  connect: jest.Mock;
  disconnect: jest.Mock;
};

type MockMediaElementSource = {
  connect: jest.Mock;
  disconnect: jest.Mock;
};

type MockAudioContext = {
  state: 'suspended' | 'running';
  destination: { __isDestination: true };
  resume: jest.Mock<Promise<void>, []>;
  createGain: jest.Mock<MockGainNode, []>;
  createMediaElementSource: jest.Mock<MockMediaElementSource, [HTMLAudioElement]>;
};

type AudioMocks = {
  instances: MockAudioContext[];
  gainNodes: MockGainNode[];
  sourceNodes: MockMediaElementSource[];
  lastContext: () => MockAudioContext | undefined;
  reset: () => void;
};

const makeAudioContext = (): MockAudioContext => {
  const instance: MockAudioContext = {
    state: 'suspended',
    destination: { __isDestination: true },
    resume: jest.fn(async () => {
      instance.state = 'running';
    }),
    createGain: jest.fn(() => {
      const node: MockGainNode = {
        gain: { value: 0 },
        connect: jest.fn(),
        disconnect: jest.fn(),
      };
      audioMocks.gainNodes.push(node);
      return node;
    }),
    createMediaElementSource: jest.fn((_element: HTMLAudioElement) => {
      const node: MockMediaElementSource = {
        connect: jest.fn(),
        disconnect: jest.fn(),
      };
      audioMocks.sourceNodes.push(node);
      return node;
    }),
  };
  audioMocks.instances.push(instance);
  return instance;
};

const audioMocks: AudioMocks = {
  instances: [],
  gainNodes: [],
  sourceNodes: [],
  lastContext: () => audioMocks.instances[audioMocks.instances.length - 1],
  reset: () => {
    audioMocks.instances.length = 0;
    audioMocks.gainNodes.length = 0;
    audioMocks.sourceNodes.length = 0;
  },
};

(globalThis as unknown as { __audioMocks: AudioMocks }).__audioMocks = audioMocks;

const AudioContextCtor = function AudioContextCtor(this: MockAudioContext) {
  const instance = makeAudioContext();
  Object.assign(this, instance);
} as unknown as typeof AudioContext;

const installAudioContext = () => {
  (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
    AudioContextCtor;
  (window as unknown as { AudioContext: typeof AudioContext }).AudioContext =
    AudioContextCtor;
  (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
    AudioContextCtor;
};

installAudioContext();

(globalThis as unknown as { __installAudioContext: () => void }).__installAudioContext =
  installAudioContext;

/**
 * React Native's `__DEV__` global is injected by `react-native/jest/setup.js`,
 * which only the `jest-expo` preset pulls in - i.e. only the "native" project.
 * The "web" project runs plain jsdom, so anything importing `utils/logger`
 * (nearly every suite) would throw `ReferenceError: __DEV__ is not defined`.
 * Define it here so both projects agree.
 */
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

// jsdom's HTMLAudioElement.play is not implemented. Stub it.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = jest.fn(async () => {
    // simulate the browser firing 'playing' on next tick
  });
  HTMLMediaElement.prototype.pause = jest.fn();
  HTMLMediaElement.prototype.load = jest.fn();
}
