'use client';

import type { ReactNode } from 'react';
import { ApiError, ERROR_TEXT } from '@/lib/types';

type Tone = 'info' | 'warn' | 'error' | 'success';

const TONES: Record<Tone, string> = {
  info: 'bg-forest/8 text-forest border-forest/15',
  warn: 'bg-amber-100 text-amber-900 border-amber-300',
  error: 'bg-red-100 text-red-900 border-red-300',
  success: 'bg-emerald-100 text-emerald-900 border-emerald-300',
};

/** A full-width strip across the top of a screen. Phase, pause, offline. */
export function Banner({
  tone = 'info',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={['rounded-xl border px-4 py-3 text-sm', TONES[tone]].join(' ')}
    >
      {children}
    </div>
  );
}

/**
 * The one place an error reaches a guest. Pass the caught ApiError and this
 * prints the friendly sentence from ERROR_TEXT. Never print err.message.
 */
export function ErrorNote({ error }: { error: ApiError | null }) {
  if (!error) return null;

  let text = ERROR_TEXT[error.code];
  if (error.code === 'COOLDOWN' && error.retryAfterSeconds) {
    text = `${text} Try again in ${error.retryAfterSeconds}s.`;
  }
  if (error.code === 'TOO_EARLY' && error.waitSeconds) {
    text = `${text} ${error.waitSeconds}s to go.`;
  }

  return <Banner tone="error">{text}</Banner>;
}
