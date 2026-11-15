/**
 * Wraps the check-in screen in the signed-in bar, so a volunteer can see which
 * account the gate phone is on and hand it over at a shift change.
 */

import type { ReactNode } from 'react';
import { TopBar } from '@/components/ui';

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}
