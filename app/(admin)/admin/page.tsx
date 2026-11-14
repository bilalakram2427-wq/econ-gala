'use client';

/**
 * ADMIN — Task 2.
 *
 * Game control (phase buttons with a confirm dialog, pause and resume), the
 * overview counters, the full leaderboard, and the comeback list.
 *
 * The comeback list is the bottom 25% and is ADMIN ONLY. Do not screen-share
 * this page. Use /display for the projector.
 *
 * The server refuses any state transition that skips a state; GameControl
 * shows that refusal as a sentence. All data comes from adminApi in lib/api.
 * Everything polls: overview every 5 seconds, the rest every 10.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banner, ErrorNote, Loading } from '@/components/ui';
import { adminApi, poll } from '@/lib/api';
import { ComebackList } from '@/components/admin/ComebackList';
import { GameControl } from '@/components/admin/GameControl';
import { LeaderboardTable } from '@/components/admin/LeaderboardTable';
import { OverviewStats } from '@/components/admin/OverviewStats';
import { useOffline } from '@/components/admin/useOffline';
import type {
  AdminLeaderboardRow,
  AdminOverview,
  ApiError,
  ComebackRow,
} from '@/lib/types';

const OVERVIEW_MS = 5000;
const SLOWER_MS = 10000;

export default function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [board, setBoard] = useState<AdminLeaderboardRow[] | null>(null);
  const [comeback, setComeback] = useState<ComebackRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  // Bump to restart the polls right away, e.g. after a phase change.
  const [refreshKey, setRefreshKey] = useState(0);
  const offline = useOffline();

  useEffect(
    () =>
      poll(
        adminApi.overview,
        OVERVIEW_MS,
        (d) => {
          setOverview(d);
          setError(null);
        },
        setError,
      ),
    [refreshKey],
  );

  useEffect(
    () => poll(adminApi.leaderboardFull, SLOWER_MS, setBoard, setError),
    [refreshKey],
  );

  useEffect(
    () => poll(adminApi.comebackList, SLOWER_MS, setComeback, setError),
    [refreshKey],
  );

  if (!overview && !error) return <Loading />;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-3xl">Admin</h1>
        <Link
          href="/admin/guests"
          className="min-h-tap text-bronze underline underline-offset-4"
        >
          Guests →
        </Link>
      </div>

      {offline ? (
        <Banner tone="warn">
          No connection. Numbers on screen are the last ones we loaded.
        </Banner>
      ) : null}

      <ErrorNote error={error} />

      {error?.code === 'UNAUTHENTICATED' ? (
        <Banner tone="warn">
          You are not signed in as an admin.{' '}
          <Link href="/login" className="font-medium underline">
            Go to sign in
          </Link>
          , then come back to this page.
        </Banner>
      ) : null}

      {overview ? (
        <>
          <GameControl
            state={overview.state}
            paused={overview.paused}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
          <OverviewStats overview={overview} />
        </>
      ) : null}

      <LeaderboardTable rows={board} />
      <ComebackList rows={comeback} />
    </div>
  );
}
