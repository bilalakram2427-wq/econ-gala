'use client';

/**
 * STAFF CHECK-IN — Task 2.
 *
 * A volunteer searches by name or reg number, checks the guest's ID against
 * the name on screen, and taps Check in. The reg number and password then
 * appear FOR THAT ONE GUEST so the volunteer can read them out.
 *
 * Never render a list of passwords. One guest, on tap, and it disappears when
 * the volunteer taps Done. Used one-handed at a gate, so the search box and
 * the counter stay pinned at the top and the targets are big.
 *
 * All data comes from staffApi in lib/api.ts. No Supabase here.
 */

import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, ErrorNote, Screen } from '@/components/ui';
import { GuestCard } from '@/components/staff/GuestCard';
import { poll, staffApi } from '@/lib/api';
import { POLL_MS } from '@/lib/config';
import {
  ApiError,
  type GuestCredentials,
  type StaffCounters,
  type StaffGuest,
} from '@/lib/types';

/** Show at most this many results. The volunteer narrows it by typing more. */
const MAX_RESULTS = 20;
/** Wait for a pause in typing before asking the server. */
const SEARCH_DELAY_MS = 250;

function asApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError('UNKNOWN', 'Unexpected error');
}

export default function CheckinPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StaffGuest[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [counters, setCounters] = useState<StaffCounters | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [actionNetworkError, setActionNetworkError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Credentials for ONE guest at a time. Never an array.
  const [shown, setShown] = useState<{
    guest: StaffGuest;
    creds: GuestCredentials;
  } | null>(null);
  // Bump this to re-run the current search (after a check-in, or when back online).
  const [reloadKey, setReloadKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------ counters */

  useEffect(() => poll(staffApi.counters, POLL_MS.staff, setCounters, setError), []);

  /* --------------------------------------------------- online / offline */

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      setReloadKey((k) => k + 1);
    };
    if (!navigator.onLine) setOffline(true);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  /* -------------------------------------------------------------- search */

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const rows = await staffApi.search(q);
        if (cancelled) return;
        setResults(rows);
        setSearched(true);
        setError(null);
        setOffline(false);
      } catch (e) {
        if (cancelled) return;
        const err = asApiError(e);
        // On a network drop, keep the last results on screen and say so.
        if (err.code === 'NETWORK') setOffline(true);
        else setError(err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, reloadKey]);

  /* ------------------------------------------------------------- actions */

  async function run(guest: StaffGuest, action: 'checkin' | 'reveal') {
    if (busyId) return; // one request at a time: no double check-in
    setBusyId(guest.guest_id);
    setError(null);
    setActionNetworkError(false);
    try {
      const creds =
        action === 'checkin'
          ? await staffApi.checkin(guest.guest_id)
          : await staffApi.revealCredentials(guest.guest_id);
      setShown({ guest, creds });
      setOffline(false);
      if (action === 'checkin') {
        // Ask the server for the new numbers; the client never counts itself.
        staffApi.counters().then(setCounters).catch(() => {});
        setReloadKey((k) => k + 1);
      }
    } catch (e) {
      const err = asApiError(e);
      if (err.code === 'NETWORK') {
        setOffline(true);
        setActionNetworkError(true);
      } else {
        setError(err);
      }
    } finally {
      setBusyId(null);
    }
  }

  function done() {
    setShown(null);
    setQuery('');
    setResults([]);
    setSearched(false);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  /* -------------------------------------------------------------- render */

  const counterText = counters ? `${counters.checked_in} / ${counters.total}` : '— / —';
  const visible = results.slice(0, MAX_RESULTS);

  return (
    <Screen>
      {/* Pinned header: counter and search stay on screen when the keyboard opens. */}
      <div className="sticky top-0 z-10 -mx-4 space-y-3 bg-ivory px-4 pb-3 pt-1">
        <div className="flex items-baseline justify-between">
          <h1 className="font-heading text-3xl">Check in</h1>
          <div className="text-xl font-medium text-bronze" aria-label="Checked in out of total">
            {counterText}
          </div>
        </div>

        {!shown ? (
          <input
            ref={searchRef}
            autoFocus
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or reg number"
            aria-label="Search by name or reg number"
            className="min-h-tap w-full rounded-xl border-2 border-forest/25 bg-white px-4 text-forest placeholder:text-forest/50 focus:border-bronze focus:outline-none"
          />
        ) : null}
      </div>

      {offline ? (
        <Banner tone="warn">
          No connection. What is on screen is the last thing we loaded. Check-in
          needs signal.
        </Banner>
      ) : null}

      {actionNetworkError ? (
        <Banner tone="error">
          That did not go through. Tap again when the connection is back.
        </Banner>
      ) : null}

      <ErrorNote error={error} />

      {shown ? (
        <Card className="space-y-5 text-center">
          <div className="font-heading text-2xl">✓ {shown.guest.full_name}</div>

          <div>
            <div className="text-xs uppercase tracking-wide text-forest/60">
              Reg number
            </div>
            <div className="select-all break-all font-mono text-3xl font-semibold">
              {shown.creds.reg_no}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-forest/60">
              Password
            </div>
            <div className="select-all font-mono text-5xl font-semibold tracking-widest text-bronze">
              {shown.creds.password}
            </div>
          </div>

          <p className="text-forest/70">Type these into your own phone.</p>

          <Button full onClick={done}>
            Done
          </Button>
        </Card>
      ) : (
        <>
          {query.trim().length < 2 ? (
            <p className="text-forest/70">
              Type a name or reg number to find a guest.
            </p>
          ) : null}

          {searching && !searched ? (
            <p className="text-forest/70" role="status">
              Searching…
            </p>
          ) : null}

          {searched && query.trim().length >= 2 && results.length === 0 ? (
            <Card>
              <p className="text-forest/80">
                No one matches that. Check the spelling, or ask for their reg
                number.
              </p>
            </Card>
          ) : null}

          {visible.map((g) => (
            <GuestCard
              key={g.guest_id}
              guest={g}
              busy={busyId === g.guest_id}
              locked={busyId !== null}
              onCheckin={(guest) => void run(guest, 'checkin')}
              onReveal={(guest) => void run(guest, 'reveal')}
            />
          ))}

          {results.length > MAX_RESULTS ? (
            <p className="text-sm text-forest/60">
              Showing the first {MAX_RESULTS}. Type more to narrow it down.
            </p>
          ) : null}
        </>
      )}
    </Screen>
  );
}
