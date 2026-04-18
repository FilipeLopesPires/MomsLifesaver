/**
 * Parse a MM:SS start-time string into milliseconds.
 *
 * Accepts 1- or 2-digit minutes and exactly 2-digit seconds with seconds < 60.
 * Returns null for any input that doesn't match the format.
 */
export const parseStartTime = (value: string): number | null => {
  const match = value.trim().match(/^([0-9]{1,2}):([0-9]{2})$/);
  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);

  if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds >= 60) {
    return null;
  }

  return (minutes * 60 + seconds) * 1000;
};
