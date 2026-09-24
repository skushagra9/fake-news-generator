const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/**
 * Formats a duration given in seconds as a short, human-readable string.
 *
 * Only the units that are actually present are included, so a value spanning
 * days, hours, minutes and seconds reads as "1d 1h 1m 1s", an
 * hours-and-minutes value reads as "1h 1m", and a value under a minute reads
 * as "45s". A zero duration renders as "0s".
 *
 * The input is floored to whole seconds, and negative values are treated as 0.
 * Non-finite input is rejected rather than coerced, so a caller bug surfaces at
 * the call site instead of rendering as a plausible-looking "0s".
 *
 * @param seconds - The duration in seconds. Must be a finite number.
 * @returns The duration as a short string, e.g. "0s", "1m 30s" or "1d 1h 1m 1s".
 * @throws {RangeError} If `seconds` is not finite (NaN, Infinity or -Infinity).
 *
 * @example
 * formatDuration(0); // "0s"
 * formatDuration(90); // "1m 30s"
 * formatDuration(3661); // "1h 1m 1s"
 * formatDuration(90061); // "1d 1h 1m 1s"
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    throw new RangeError(
      `formatDuration expects a finite number of seconds, received ${seconds}`
    );
  }

  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / SECONDS_PER_DAY);
  const hours = Math.floor((total % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = total % SECONDS_PER_MINUTE;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}
