# Database

Owner: Bilal. Nobody else edits this folder.

Not written yet. Coming here:

- `migrations/001_schema.sql` — tables, enums, indexes, the unique pair index
- `migrations/002_rls.sql` — row level security; no client writes anywhere
- `migrations/003_functions.sql` — me, get_qr, scan, submit, top10, and the
  staff and admin RPCs, with the row locks
- `migrations/004_cron.sql` — expire stale pending and active connections
- `seed/` — conversation starters, config defaults, guest list import

Rules this has to hold up (spec section 4): R1 eligibility, R2 scoring,
R3 one connection per pair ever, R4 one at a time, R5 pacing, R6 submission,
R7 cap at 20, R8 both sides required, R10 winners, R11 visibility.

Plus the check-in gate from `docs/DECISIONS.md` D3: every RPC refuses with
`NOT_CHECKED_IN` until a volunteer has checked the guest in, however valid
their login.

Until this lands, everything runs against `lib/mocks.ts`.
