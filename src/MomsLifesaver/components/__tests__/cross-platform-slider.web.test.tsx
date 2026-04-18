/**
 * Tests for components/cross-platform-slider.tsx on web (Batch 6).
 *
 * Platform.OS is flipped to 'web' on the jest-expo-mocked react-native module
 * before rendering so the component takes its WebSlider branch. The community
 * slider is also stubbed so that the module-level `require` at load time is a
 * harmless no-op when Platform.OS is still the default 'ios'.
 */

import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('@react-native-community/slider', () => ({
  __esModule: true,
  default: () => null,
}));

import { CrossPlatformSlider } from '@/components/cross-platform-slider';

type TreeNode = {
  type: string;
  props: Record<string, any>;
  children?: (TreeNode | string)[] | null;
};

const findByType = (node: any, type: string): TreeNode | null => {
  if (!node || typeof node === 'string') {
    return null;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  }
  if (node.type === type) return node;
  return findByType(node.children, type);
};

describe('CrossPlatformSlider (web)', () => {
  const originalOS = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('renders an <input type="range"> with the forwarded value and bounds', () => {
    const { toJSON } = render(
      <CrossPlatformSlider value={0.4} minimumValue={0} maximumValue={1} />,
    );
    const input = findByType(toJSON(), 'input');

    expect(input).not.toBeNull();
    expect(input!.props.type).toBe('range');
    expect(input!.props.value).toBe(0.4);
    expect(input!.props.min).toBe(0);
    expect(input!.props.max).toBe(1);
    expect(input!.props.step).toBe(0.01);
  });

  it('calls onValueChange with the parsed numeric value on change', () => {
    const onValueChange = jest.fn();
    const { toJSON } = render(
      <CrossPlatformSlider
        value={0.4}
        minimumValue={0}
        maximumValue={1}
        onValueChange={onValueChange}
      />,
    );
    const input = findByType(toJSON(), 'input');

    input!.props.onChange({ target: { value: '0.7' } });

    expect(onValueChange).toHaveBeenCalledWith(0.7);
  });

  it('does not crash when onValueChange is omitted', () => {
    const { toJSON } = render(
      <CrossPlatformSlider value={0.4} minimumValue={0} maximumValue={1} />,
    );
    const input = findByType(toJSON(), 'input');

    expect(() =>
      input!.props.onChange({ target: { value: '0.9' } }),
    ).not.toThrow();
  });

  it('uses the minimum- and maximum-track tint colors in the background gradient', () => {
    const { toJSON } = render(
      <CrossPlatformSlider
        value={0.25}
        minimumValue={0}
        maximumValue={1}
        minimumTrackTintColor="#111111"
        maximumTrackTintColor="#222222"
      />,
    );
    const input = findByType(toJSON(), 'input');
    const background: string = input!.props.style.background;

    expect(background).toContain('#111111');
    expect(background).toContain('#222222');
    expect(background).toContain('25%');
  });
});
