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

  describe('thumb style scoping', () => {
    const classNameOf = (tree: unknown) => findByType(tree, 'input')!.props.className as string;

    it('uses a class name that is valid in a CSS selector', () => {
      const { toJSON } = render(
        <CrossPlatformSlider value={0.4} minimumValue={0} maximumValue={1} />,
      );

      // React's useId yields ids containing ':', which would silently break
      // the injected `.<id>::-webkit-slider-thumb` rule.
      expect(classNameOf(toJSON())).toMatch(/^slider-[A-Za-z0-9_-]+$/);
    });

    it('keeps the class name stable across re-renders', () => {
      const { toJSON, rerender } = render(
        <CrossPlatformSlider value={0.4} minimumValue={0} maximumValue={1} />,
      );
      const first = classNameOf(toJSON());

      rerender(<CrossPlatformSlider value={0.9} minimumValue={0} maximumValue={1} />);

      // A per-render id (the old Math.random version) rewrote the <style>
      // block and swapped className on every drag tick, forcing a CSS recalc
      // per pointer event, and made render impure.
      expect(classNameOf(toJSON())).toBe(first);
    });

    it('scopes the injected style block to that same class', () => {
      const { toJSON } = render(
        <CrossPlatformSlider value={0.4} minimumValue={0} maximumValue={1} />,
      );
      const className = classNameOf(toJSON());
      const style = findByType(toJSON(), 'style')!;
      const css = String(style.children);

      expect(css).toContain(`.${className}::-webkit-slider-thumb`);
      expect(css).toContain(`.${className}::-moz-range-thumb`);
    });

    it('gives two sliders on the same screen distinct class names', () => {
      const { toJSON } = render(
        <>
          <CrossPlatformSlider value={0.2} minimumValue={0} maximumValue={1} />
          <CrossPlatformSlider value={0.8} minimumValue={0} maximumValue={1} />
        </>,
      );
      const tree = toJSON() as unknown as unknown[];

      const first = classNameOf(tree[0]);
      const second = classNameOf(tree[1]);

      // Per-track sliders must not share a rule, or restyling one restyles all.
      expect(first).not.toBe(second);
    });
  });
});
