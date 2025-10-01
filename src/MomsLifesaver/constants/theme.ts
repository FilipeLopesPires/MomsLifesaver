/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export const Colors = {
  background: '#090B10',
  surface: '#111520',
  surfaceActive: '#1B2233',
  textPrimary: '#F5F7FA',
  textSecondary: '#9BA5BD',
  accent: '#6C8CFF',
  accentMuted: '#3F4F80',
  border: '#232B3D',
  borderActive: '#6C8CFF',
};

export const Typography = {
  title: {
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
    color: Colors.textPrimary,
  },
  label: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
    color: Colors.textPrimary,
  },
  hint: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '400' as const,
    letterSpacing: 0.2,
    color: Colors.textSecondary,
  },
};
