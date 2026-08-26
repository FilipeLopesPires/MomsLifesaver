/**
 * The app's colour and type scale.
 *
 * Deliberately a single dark scheme rather than the light/dark pair from the
 * Expo template: the UI is dark-only (see `app/_layout.tsx`, which always
 * supplies `DarkTheme`, and `app.json`'s `userInterfaceStyle: "dark"`).
 * Adding light-mode support means reintroducing a scheme-aware lookup here
 * and threading it through every `Colors.*` reference.
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
  danger: '#E4708A',
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
