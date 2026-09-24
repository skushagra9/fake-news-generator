/**
 * Formats a duration given in seconds as a short, human-readable string.
 *
 * Only the units that are actually present are included, so a value spanning
 * hours, minutes and seconds reads as "1h 1m 1s", while a minutes-and-seconds
 * value reads as "1m 30s" and a value under a minute reads as "45s". A zero
 * duration renders as "0s".
 *
 * The input is floored to whole seconds, and negative values are treated as 0.
 * Non-finite input is rejected rather than coerced, so a caller bug surfaces at
 * the call site instead of rendering as a plausible-looking "0s".
 *
 * @param seconds - The duration in seconds. Must be a finite number.
 * @returns The duration as a short string, e.g. "0s", "1m 30s" or "1h 1m 1s".
 * @throws {RangeError} If `seconds` is not finite (NaN, Infinity or -Infinity).
 *
 * @example
 * formatDuration(0); // "0s"
 * formatDuration(90); // "1m 30s"
 * formatDuration(3661); // "1h 1m 1s"
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    throw new RangeError(
      `formatDuration expects a finite number of seconds, received ${seconds}`
    );
  }

  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}
