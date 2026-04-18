/**
 * Centralized error reporting helpers.
 *
 * `handleError` logs the full technical error via the app logger and
 * (on native only) shows a short, user-friendly `Alert`. Web surfaces
 * errors silently because hot reloads during development would trigger
 * an alert on every save.
 *
 * `handleErrorSilent` logs but never alerts - use it for non-critical
 * errors where a popup would be noise.
 */
import { Alert, Platform } from 'react-native';
import { logError } from './logger';

type ErrorContext = 'audio' | 'foreground-service' | 'general';

const USER_FRIENDLY_MESSAGES: Record<ErrorContext, string> = {
  'audio': 'Unable to play audio. Please try again.',
  'foreground-service': 'Background playback encountered an issue. Audio may stop when the app is minimized.',
  'general': 'Something went wrong. Please try again.',
};

export const handleError = (
  error: unknown,
  context: ErrorContext,
  technicalMessage: string
) => {
  // Always log the full technical error
  logError(`[${context}] ${technicalMessage}:`, error);

  // Show user-friendly alert (only on mobile, not during development hot reloads)
  if (Platform.OS !== 'web') {
    const userMessage = USER_FRIENDLY_MESSAGES[context];
    Alert.alert(
      "Oops!",
      userMessage,
      [{ text: "OK", style: "default" }],
      { cancelable: true }
    );
  }
};

export const handleErrorSilent = (
  error: unknown,
  context: ErrorContext,
  technicalMessage: string
) => {
  // Only log, don't show alert (for non-critical errors)
  logError(`[${context}] ${technicalMessage}:`, error);
};

// Test function - call from React DevTools console or add a temp button
// Usage: import { testErrorAlert } from '@/utils/error-handler'; testErrorAlert('audio');
export const testErrorAlert = (context: ErrorContext = 'general') => {
  handleError(new Error('Test error'), context, 'This is a test error');
};
