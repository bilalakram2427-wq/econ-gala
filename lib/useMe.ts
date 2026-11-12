'use client';

import { useEffect, useState } from 'react';
import { api, poll } from './api';
import { POLL_MS } from './config';
import { syncClock } from './time';
import { ApiError, type MeResponse } from './types';

/**
 * Subscribes a guest screen to me(), the single source of truth for what the
 * guest app shows. Handles the clock sync for you.
 *
 *   const { me, error, loading, refresh } = useMe();
 *
 * Every guest screen uses this. Do not call api.me() directly in a component,
 * and do not write your own interval — three screens polling in three
 * different ways is three different bugs when the wifi drops.
 *
 * `refresh()` forces an immediate fetch: call it right after a successful
 * action (a scan, a submit) instead of waiting for the next tick.
 */
export function useMe(intervalMs: number = POLL_MS.guestHome) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const stop = poll<MeResponse>(
      api.me,
      intervalMs,
      (data) => {
        syncClock(data.server_time);
        setMe(data);
        setError(null);
      },
      setError,
    );
    return stop;
  }, [intervalMs, tick]);

  return {
    me,
    error,
    loading: me === null && error === null,
    refresh: () => setTick((n) => n + 1),
  };
}
