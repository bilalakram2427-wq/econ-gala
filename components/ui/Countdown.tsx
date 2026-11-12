'use client';

import { useEffect, useState } from 'react';
import { mmss, secondsUntil } from '@/lib/time';

/**
 * Counts down to an ISO timestamp using the server-corrected clock.
 * Ticks locally once a second; it does not poll. When it reaches zero it calls
 * onDone once — use that to refetch, not to decide anything the server decides.
 */
export function Countdown({
  to,
  onDone,
  className = '',
  prefix,
}: {
  to: string;
  onDone?: () => void;
  className?: string;
  prefix?: string;
}) {
  const [left, setLeft] = useState(() => secondsUntil(to));

  useEffect(() => {
    setLeft(secondsUntil(to));
    const id = setInterval(() => {
      const next = secondsUntil(to);
      setLeft(next);
      if (next <= 0) {
        clearInterval(id);
        onDone?.();
      }
    }, 1000);
    return () => clearInterval(id);
    // onDone is intentionally not a dependency: callers usually pass an inline
    // function, and re-running this effect every render would reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  return (
    <span className={className}>
      {prefix}
      {mmss(left)}
    </span>
  );
}

/**
 * The ring around the QR code. Empties over one 30-second window.
 * `endsAt` is the ISO time the current window closes.
 */
export function CountdownRing({
  endsAt,
  windowSeconds,
  size = 40,
}: {
  endsAt: string;
  windowSeconds: number;
  size?: number;
}) {
  const [left, setLeft] = useState(() => secondsUntil(endsAt));

  useEffect(() => {
    setLeft(secondsUntil(endsAt));
    const id = setInterval(() => setLeft(secondsUntil(endsAt)), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const r = size / 2 - 3;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.min(1, Math.max(0, left / windowSeconds));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${left} seconds until this code changes`}
      role="img"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={3}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
