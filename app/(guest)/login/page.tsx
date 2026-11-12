'use client';

/**
 * LOGIN — Task 1.
 *
 * Reg number + password, handed out by a volunteer at check-in.
 * Logging in succeeds even before check-in; the home screen shows the
 * "see you at the gate" state in that case. Do not try to block it here.
 *
 * Build: the form, the busy state, BAD_CREDENTIALS handling, and a redirect
 * to "/" on success. Mock logins are listed at the top of lib/mocks.ts.
 */

import { Screen } from '@/components/ui';

export default function LoginPage() {
  return (
    <Screen title="Econ Gala">
      {/* TODO Task 1: reg# + password form calling auth.login() from @/lib/api */}
      <p className="text-forest/60">Login form goes here.</p>
    </Screen>
  );
}
