'use client';

/**
 * The thin bar at the top of every signed-in screen: who you are, and a way
 * out. Added because nothing in the app showed either one, so a volunteer
 * handing over the gate phone at a shift change had no way to sign out, and
 * "which account are you on?" had no answer short of opening the database.
 *
 * Renders nothing when there is no session, which is how the login page and
 * the display screen stay clean without either of them knowing about it.
 *
 * The name costs nothing: it comes from the session already in the browser,
 * not from a call to the server. Do not add one here — this mounts on every
 * screen, 250 phones over an hour.
 *
 * Owner: Bilal.
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/api';

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();

  const [regNo, setRegNo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-read on every navigation. Layouts survive client-side route changes,
  // so without the pathname here the bar would still be empty after login.
  useEffect(() => {
    let alive = true;

    auth
      .currentRegNo()
      .then((value) => {
        if (alive) setRegNo(value);
      })
      .catch(() => {
        if (alive) setRegNo(null);
      });

    return () => {
      alive = false;
    };
  }, [pathname]);

  async function handleLogout() {
    setBusy(true);
    try {
      await auth.logout();
    } catch {
      // Offline or the server refused. The local session is cleared either
      // way, and leaving someone signed in is the worse outcome.
    }
    setRegNo(null);
    router.replace('/login');
    router.refresh();
  }

  if (!regNo) return null;

  return (
    <div className="sticky top-0 z-40 h-12 border-b border-forest/10 bg-ivory/90 backdrop-blur">
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between gap-3 px-4">
        <span className="truncate text-sm text-forest/60">
          Signed in as{' '}
          <span className="font-medium text-forest">{regNo}</span>
        </span>

        {/* Deliberately below the 48px tap target the rest of the app uses.
            This is the one button nobody should hit by accident in the dark. */}
        <button
          onClick={handleLogout}
          disabled={busy}
          className="min-h-0 shrink-0 rounded-lg border border-forest/20 px-3 py-1.5
                     text-sm text-forest/70 transition-colors
                     hover:border-forest/40 hover:text-forest disabled:opacity-50"
        >
          {busy ? 'Signing out...' : 'Log out'}
        </button>
      </div>
    </div>
  );
}
