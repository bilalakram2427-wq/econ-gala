'use client';

import { Card, Stat } from '@/components/ui';
import type { AdminOverview } from '@/lib/types';

/** The six counters. The page refreshes them about every 5 seconds. */
export function OverviewStats({ overview }: { overview: AdminOverview }) {
  return (
    <Card>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Checked in" value={overview.checked_in} />
        <Stat label="Joined" value={overview.opted_in} />
        <Stat label="Completed" value={overview.connections_completed} />
        <Stat label="Live now" value={overview.connections_active} />
        <Stat label="Per minute" value={overview.connections_per_minute} />
        <Stat label="Open flags" value={overview.open_flags} />
      </div>
    </Card>
  );
}
