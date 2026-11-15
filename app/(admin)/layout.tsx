/**
 * Wraps the admin screens in the signed-in bar.
 *
 * The log out button matters most here: an admin session left open on the
 * laptop driving the projector is the one thing we agreed must not happen.
 */

import type { ReactNode } from 'react';
import { TopBar } from '@/components/ui';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}
