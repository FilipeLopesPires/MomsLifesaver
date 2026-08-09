/**
 * iOS resolution of the media-notification module.
 *
 * `expo-module.config.json` declares `android` only, so there is no iOS native
 * counterpart to require - and without this file Metro would fall back to
 * `index.ts`, whose module-scope `requireNativeModule` call would throw before
 * the first render.
 *
 * iOS lock-screen controls are `MPNowPlayingInfoCenter` work, deliberately out
 * of scope here; background audio already comes from the `UIBackgroundModes`
 * entitlement plus expo-audio. Re-exported from the web shim (rather than
 * copied) so the two cannot drift.
 */
export * from './index.web';
export { default } from './index.web';
