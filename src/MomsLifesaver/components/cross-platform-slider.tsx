/**
 * Thin wrapper around a slider input that renders an `<input type="range">`
 * on web (styled with inline CSS to match the app's theme) and delegates
 * to `@react-native-community/slider` on native. The two implementations
 * share the same prop contract so callers don't have to branch.
 */
import { useId } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

type SliderProps = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  onValueChange?: (value: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  style?: any;
};

const WebSlider = ({
  value,
  minimumValue,
  maximumValue,
  onValueChange,
  minimumTrackTintColor = Colors.accent,
  maximumTrackTintColor = Colors.border,
  thumbTintColor = Colors.accent,
  style,
}: SliderProps) => {
  const percentage = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;
  // useId, not Math.random: the previous version minted a new class name on
  // every render, so dragging rewrote the injected <style> block and swapped
  // the input's className on every pointer event - a full CSS recalc per
  // frame, per visible slider. It also made render impure, which breaks
  // hydration when the markup is pre-rendered. useId is stable per instance
  // and identical across server and client.
  // React's generated ids contain ':', which is not valid in a CSS class
  // selector, so strip everything that is not safe for one.
  const instanceId = useId();
  const sliderId = `slider-${instanceId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <View style={[styles.webContainer, style]}>
      <input
        type="range"
        className={sliderId}
        min={minimumValue}
        max={maximumValue}
        step={0.01}
        value={value}
        onChange={(e) => onValueChange?.(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: 4,
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          background: `linear-gradient(to right, ${minimumTrackTintColor} 0%, ${minimumTrackTintColor} ${percentage}%, ${maximumTrackTintColor} ${percentage}%, ${maximumTrackTintColor} 100%)`,
          borderRadius: 2,
          outline: 'none',
        }}
      />
      <style>{`
        .${sliderId}::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${thumbTintColor};
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .${sliderId}::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${thumbTintColor};
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
      `}</style>
    </View>
  );
};

// Native slider - use the community slider
const NativeSlider = Platform.OS !== 'web' 
  ? require('@react-native-community/slider').default 
  : null;

export const CrossPlatformSlider = (props: SliderProps) => {
  if (Platform.OS === 'web') {
    return <WebSlider {...props} />;
  }
  
  return <NativeSlider {...props} />;
};

const styles = StyleSheet.create({
  webContainer: {
    width: '100%',
    justifyContent: 'center',
  },
});
