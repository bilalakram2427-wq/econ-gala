'use client';

/**
 * ADMIN -> GUESTS
 *
 * The whole roster: who is playing, who is at the venue but has not joined,
 * and who has not turned up. Plus the three things an admin may change about
 * a guest.
 *
 * OWNERSHIP NOTE: this file sits inside the (admin) route group, which is
 * Meerab's. Bilal owns this one file and this one folder — it was added after
 * her task card was written, so it is not part of Task 2. Nothing here imports
 * from components/admin, so the two do not collide.
 *
 * Admin only. These rows carry email and phone numbers; nothing from this
 * screen goes anywhere near the display or a guest's phone.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, ErrorNote, Loading } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { ApiError, type AdminGuestCounts, type AdminGuestRow, type Arrival } from '@/lib/types';

type Filter = Arrival | 'all';

const FILTERS: { key: Filter; label: string; countKey: keyof AdminGuestCounts }[] = [
  { key: 'all',         label: 'Everyone',    countKey: 'all' },
  { key: 'playing',     label: 'Playing',     countKey: 'playing' },
  { key: 'checked_in',  label: 'Not joined',  countKey: 'checked_in' },
  { key: 'not_arrived', label: 'Not arrived', countKey: 'not_arrived' },
];

const PAYMENT_OPTIONS = ['Verified', 'Proof submitted', 'Unpaid'];

export default function AdminGuestsPage() {
  const [rows, setRows] = useState<AdminGuestRow[] | null>(null);
  const [counts, setCounts] = useState<AdminGuestCounts | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<ApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, c] = await Promise.all([
        adminApi.guestList(query, filter),
        adminApi.guestCounts(),
      ]);
      setRows(list);
      setCounts(c);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err);
    }
  }, [query, filter]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  async function act(guestId: string, fn: () => Promise<unknown>) {
    setBusyId(guestId);
    try {
      await fn();
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err);
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null && error === null) return <Loading />;

  return (
    <div className="min-h-dvh">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-heading text-3xl text-forest">Guests</h1>
          <Link href="/admin" className="text-sm text-bronze underline underline-offset-4">
            Back to admin
          </Link>
        </div>

        <ErrorNote error={error} />

        {/* Filters. The counts come from the server, so "not arrived: 107"
            does not require fetching 107 rows to count them. */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={[
                'min-h-tap px-4 rounded-xl text-sm font-medium border-2 transition-colors',
                filter === f.key
                  ? 'bg-bronze text-ivory border-bronze'
                  : 'bg-transparent text-forest border-forest/20 hover:border-forest/40',
              ].join(' ')}
            >
              {f.label}
              {counts ? (
                <span className="ml-2 opacity-70">{counts[f.countKey]}</span>
              ) : null}
            </button>
          ))}
          {counts && counts.unpaid > 0 ? (
            <span className="min-h-tap px-4 inline-flex items-center rounded-xl text-sm bg-amber-100 text-amber-900 border-2 border-amber-300">
              {counts.unpaid} unpaid
            </span>
          ) : null}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, roll number or email"
          className="w-full min-h-tap px-4 rounded-xl border-2 border-forest/20 bg-white/70
                     focus:border-bronze focus:outline-none"
        />

        {rows && rows.length === 0 ? (
          <Card>
            <p className="text-forest/60">Nobody matches that.</p>
          </Card>
        ) : null}

        <div className="space-y-2">
          {rows?.map((g) => {
            const open = openId === g.guest_id;
            return (
              <Card key={g.guest_id} className="p-4">
                <button
                  onClick={() => setOpenId(open ? null : g.guest_id)}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-forest">{g.full_name}</span>
                    <ArrivalPill arrival={g.arrival} />
                    {g.is_organizer ? <Tag>organizer</Tag> : null}
                    {g.disqualified ? <Tag tone="red">disqualified</Tag> : null}
                    {g.payment_status !== 'Verified' ? (
                      <Tag tone="amber">{g.payment_status ?? 'no payment record'}</Tag>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-forest/55">
                    {g.reg_no}
                    {g.email ? <> · {g.email}</> : null}
                    {g.arrival === 'playing' ? (
                      <> · {g.score} pts, {g.connections} met</>
                    ) : null}
                  </div>
                </button>

                {open ? (
                  <div className="mt-4 pt-4 border-t border-forest/10 space-y-4">
                    {g.phone ? (
                      <div className="text-sm text-forest/55">Phone: {g.phone}</div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-forest/70 w-28">Payment</span>
                      {PAYMENT_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          disabled={busyId === g.guest_id || g.payment_status === opt}
                          onClick={() =>
                            act(g.guest_id, () => adminApi.setPaymentStatus(g.guest_id, opt))
                          }
                          className={[
                            'min-h-tap px-3 rounded-lg text-sm border-2 disabled:opacity-100',
                            g.payment_status === opt
                              ? 'bg-forest text-ivory border-forest'
                              : 'border-forest/20 hover:border-forest/40 disabled:opacity-40',
                          ].join(' ')}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-forest/70 w-28">Flags</span>
                      <Button
                        variant="secondary"
                        busy={busyId === g.guest_id}
                        onClick={() =>
                          act(g.guest_id, () =>
                            adminApi.setOrganizer(g.guest_id, !g.is_organizer))
                        }
                      >
                        {g.is_organizer ? 'Not an organizer' : 'Mark organizer'}
                      </Button>
                      <Button
                        variant={g.disqualified ? 'secondary' : 'danger'}
                        busy={busyId === g.guest_id}
                        onClick={() => {
                          if (!g.disqualified &&
                              !confirm(`Disqualify ${g.full_name}? They keep playing but cannot score.`)) {
                            return;
                          }
                          act(g.guest_id, () =>
                            adminApi.setDisqualified(g.guest_id, !g.disqualified, 'admin panel'));
                        }}
                      >
                        {g.disqualified ? 'Reinstate' : 'Disqualify'}
                      </Button>
                    </div>

                    <p className="text-xs text-forest/45">
                      Organizers play but are excluded from prizes and the comeback
                      pool, so set that before the game starts. Changing payment here
                      corrects the record; to let an unpaid guest through the gate
                      without changing it, use the override on the check-in screen.
                    </p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ArrivalPill({ arrival }: { arrival: Arrival }) {
  const map: Record<Arrival, [string, string]> = {
    playing:     ['Playing',     'bg-emerald-100 text-emerald-900'],
    checked_in:  ['Not joined',  'bg-blue-100 text-blue-900'],
    not_arrived: ['Not arrived', 'bg-forest/10 text-forest/60'],
  };
  const [label, cls] = map[arrival];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function Tag({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'amber' | 'red';
}) {
  const cls = {
    neutral: 'bg-bronze/15 text-bronze',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-900',
  }[tone];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}
