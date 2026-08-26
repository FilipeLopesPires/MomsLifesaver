/**
 * iOS resolution for the notification-permission hook.
 *
 * The app does not use iOS notifications (background audio comes from the
 * `UIBackgroundModes: ["audio"]` entitlement, not a notification), so there is
 * nothing to request here. Re-exported from the web shim rather than copied so
 * the two cannot drift.
 */
export * from './use-notification-permission.web';
