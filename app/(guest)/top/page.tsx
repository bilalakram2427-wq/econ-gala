
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Screen, Card, Loading } from '@/components/ui';
import { api, poll } from '@/lib/api';
import { ERROR_TEXT, ApiError, type LeaderboardRow } from '@/lib/types';

export default function TopPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const stopPolling = poll(
      api.top10,
      10000,
      (data) => {
        setRows(data);
        setLoading(false);
        setError('');
      },
      (err) => {
        setLoading(false);
        setError(ERROR_TEXT[err.code]);
      },
    );

    return stopPolling;
  }, []);

  if (loading) {
    return (
      <Screen title="Top 10">
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen title="Top 10">
      <p className="text-sm text-forest/60">
        The guests leading the Econ Gala networking game.
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <Card className="space-y-4">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-forest/60">
            No leaderboard entries yet.
          </p>
        ) : (
          rows.map((guest) => (
            <div
              key={guest.rank}
              className="flex items-center justify-between gap-3 border-b border-forest/10 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/10 font-semibold text-forest">
                  {guest.rank}
                </span>

                <span className="font-medium text-forest">
                  {guest.display_name}
                </span>
              </div>

              <span className="font-semibold text-bronze">
                {guest.score} pts
              </span>
            </div>
          ))
        )}
      </Card>

      <p className="text-center text-xs text-forest/50">
        Leaderboard refreshes every 10 seconds.
      </p>

      <Link
        href="/"
        className="block text-center text-sm text-bronze underline underline-offset-4"
      >
        Back home
      </Link>
    </Screen>
  );
}
