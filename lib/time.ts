/**
 * Countdown helpers.
 *
 * The phone's clock is wrong often enough to matter: a guest whose phone is two
 * minutes fast would see Submit unlock early, press it, and get TOO_EARLY from
 * the server. Every response carries `server_time`, so we measure the offset
 * between their clock and the server's once, then apply it everywhere.
 *
 * Call `syncClock(me.server_time)` on each me() response — it is cheap — and
 * use `now()` instead of `Date.now()` in any countdown.
 */

let offsetMs = 0;

/** Record the gap between this device's clock and the server's. */
export function syncClock(serverTimeIso: string): void {
  const server = new Date(serverTimeIso).getTime();
  if (Number.isFinite(server)) offsetMs = server - Date.now();
}

/** Server time, as best we know it, in milliseconds. */
export function now(): number {
  return Date.now() + offsetMs;
}

/** Whole seconds left until an ISO timestamp, never negative. */
export function secondsUntil(iso: string): number {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - now()) / 1000));
}

/** Whole seconds since an ISO timestamp, never negative. */
export function secondsSince(iso: string): number {
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now() - start) / 1000));
}

/** 95 -> "1:35". Use for every countdown so they all look the same. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** A clock time in Karachi, for the display screen and admin. */
export function karachiTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PK', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
  });
}
