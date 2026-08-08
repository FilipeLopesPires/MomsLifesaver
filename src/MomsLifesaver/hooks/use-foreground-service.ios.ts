/**
 * iOS resolution for the foreground-service hook.
 *
 * The Android implementation calls `TrackPlayer.registerPlaybackService()`
 * at module scope, so merely importing it evaluates
 * `react-native-track-player`. Every *method* in that file guards on
 * `Platform.OS === 'android'`, but the module body does not - and without
 * this file iOS would resolve to it, since Metro falls back to the
 * extensionless module for any platform that has no variant.
 *
 * That matters because the project depends on a fork of
 * react-native-track-player on the old architecture. If its iOS pod is not
 * in the binary, that module-scope call throws during evaluation and takes
 * the app down before the first render.
 *
 * iOS has no equivalent of Android's foreground service: background audio
 * comes from the `UIBackgroundModes: ["audio"]` entitlement in app.json
 * plus `shouldPlayInBackground` in the controller's audio-mode config, both
 * handled by expo-audio. So the no-op web shim is exactly right here, and
 * re-exporting it (rather than copying it) keeps the two from drifting.
 */
export * from './use-foreground-service.web';
