/**
 * Wraps every guest screen in the signed-in bar. A new file on purpose: it
 * adds the bar to the login, home, scan, conversation and leaderboard pages
 * without touching any of them.
 *
 * The bar renders nothing when there is no session, so /login stays clean.
 */

import type { ReactNode } from 'react';
import { TopBar } from '@/components/ui';

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}
