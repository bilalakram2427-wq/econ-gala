'use client';

/**
 * The bottom 25% from the COMEBACK snapshot, for the host to read from.
 *
 * ADMIN ONLY. This list must never be shown on the display, never reach a
 * guest, and never be read out by name. Do not move this component into the
 * display or guest folders, and do not screen-share the admin page.
 */

import { Card } from '@/components/ui';
import type { ComebackRow } from '@/lib/types';

export function ComebackList({ rows }: { rows: ComebackRow[] | null }) {
  return (
    <Card className="space-y-3 border-amber-300">
      <div>
        <h2 className="font-heading text-2xl">Comeback list</h2>
        <p className="text-sm font-medium text-amber-900">
          Admin only. Never show this on the big screen or to guests.
        </p>
        <p className="text-sm text-forest/70">
          Bottom 25% at the snapshot, for the host to read from.
        </p>
      </div>

      {rows === null ? (
        <p className="text-forest/70" role="status">
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-forest/70">
          No snapshot yet. It is taken when you set COMEBACK.
        </p>
      ) : (
        <ol className="divide-y divide-forest/10">
          {rows.map((r, i) => (
            <li key={r.guest_id} className="flex items-baseline justify-between py-2">
              <span>
                <span className="mr-3 text-forest/60">{i + 1}</span>
                <span className="font-medium">{r.display_name}</span>
              </span>
              <span className="tabular-nums text-forest/80">
                {r.score} {r.score === 1 ? 'point' : 'points'} · {r.connections}{' '}
                {r.connections === 1 ? 'connection' : 'connections'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
