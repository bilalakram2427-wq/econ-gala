'use client';

/**
 * The full ranking for admins: points, connections, great votes and open flags.
 * Organizers and rows under review are hidden until the admin ticks the boxes.
 * Ranks are the server's; hiding a row does not renumber the others.
 */

import { useState } from 'react';
import { Card } from '@/components/ui';
import type { AdminLeaderboardRow } from '@/lib/types';

export function LeaderboardTable({ rows }: { rows: AdminLeaderboardRow[] | null }) {
  const [showOrganizers, setShowOrganizers] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const visible = (rows ?? []).filter(
    (r) => (showOrganizers || !r.is_organizer) && (showReview || !r.under_review),
  );

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6">
        <h2 className="font-heading text-2xl">Leaderboard</h2>
        <div className="flex flex-wrap gap-x-6">
          <label className="flex min-h-tap items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-bronze"
              checked={showOrganizers}
              onChange={(e) => setShowOrganizers(e.target.checked)}
            />
            Show organizers
          </label>
          <label className="flex min-h-tap items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-bronze"
              checked={showReview}
              onChange={(e) => setShowReview(e.target.checked)}
            />
            Show under review
          </label>
        </div>
      </div>

      {rows === null ? (
        <p className="text-forest/70" role="status">
          Loading…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-forest/70">No one to show yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left">
            <thead>
              <tr className="border-b border-forest/20 text-xs uppercase tracking-wide text-forest/60">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3 text-right">Points</th>
                <th className="py-2 pr-3 text-right">Conns</th>
                <th className="py-2 pr-3 text-right">Greats</th>
                <th className="py-2 text-right">Flags</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.guest_id} className="border-b border-forest/10">
                  <td className="py-2 pr-3 text-forest/70">{r.rank}</td>
                  <td className="py-2 pr-3 font-medium">
                    {r.display_name}
                    {r.is_organizer ? (
                      <span className="ml-2 text-sm text-forest/60">organizer</span>
                    ) : null}
                    {r.disqualified ? (
                      <span className="ml-2 text-sm text-red-800">disqualified</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.score}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.connections}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {r.great_votes_received}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {r.flags_open}
                    {r.under_review ? (
                      <span className="ml-1 text-amber-700" aria-label="under review">
                        ⚠
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
