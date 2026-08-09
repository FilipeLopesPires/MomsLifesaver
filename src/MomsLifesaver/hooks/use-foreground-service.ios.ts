/**
 * iOS resolution for the foreground-service hook.
 *
 * The Android implementation imports `@/modules/media-notification`, whose
 * own `index.ios.ts` shim already resolves to a no-op - so this file is not
 * strictly load-bearing the way it was under react-native-track-player, where
 * a module-scope `registerPlaybackService()` call took the app down before the
 * first render on any platform missing the native module.
 *
 * It stays because the guard is cheap and the intent is worth stating: iOS has
 * no equivalent of Android's foreground service. Background audio comes from
 * the `UIBackgroundModes: ["audio"]` entitlement in app.json plus
 * `shouldPlayInBackground` in the controller's audio-mode config, both handled
 * by expo-audio. Lock-screen controls (`MPNowPlayingInfoCenter`) are separate
 * follow-up work.
 *
 * Re-exported from the web shim (rather than copied) so the two cannot drift.
 */
export * from './use-foreground-service.web';
