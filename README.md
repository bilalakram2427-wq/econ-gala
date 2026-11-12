# Econ Gala networking game

Econ Ascent · Thursday 19 November 2026 · open-air · ~250 guests
Game window 5:25–6:30 PM (Asia/Karachi)

A mobile web app where guests earn points by meeting new people. Each guest
shows a QR code that changes every 30 seconds; two people scan each other, talk
for at least two minutes, each types one thing they learned, and both submit.
A big screen shows the live top 10.

---

## Run it

```bash
npm install
cp .env.example .env.local        # NEXT_PUBLIC_USE_MOCKS=true
npm run dev
```

`http://localhost:3000`, log in with `FA24-BED-001` / `test123`.

Everything runs against the fake backend in `lib/mocks.ts` until the database
is live — logins, scanning, the timer, scoring. Test logins and test scan codes
are in the comment at the top of that file.

Before pushing: `npm run typecheck`.

## Read these

| File | What it is |
|---|---|
| `docs/AI-BRIEF.md` | the rules — read first, and paste into your AI each session |
| `docs/DECISIONS.md` | our changes to the spec; these win over the spec |
| `docs/UI-GUIDE.md` | what every screen looks like |
| `docs/SPEC.md` | the full original specification |
| `docs/TASK-1.md` | the guest app |
| `docs/TASK-2.md` | check-in, big screen, admin |
| `docs/GITHUB-SETUP.md` | repo, access and deploys (Bilal) |

## Who owns what

| Folder | Owner |
|---|---|
| `lib/`, `components/ui/`, `db/` | Bilal |
| `app/(guest)/`, `components/guest/` | Task 1 |
| `app/(staff)/`, `app/(admin)/`, `app/(display)/` and their component folders | Task 2 |

Nobody edits a folder they do not own. If you need something in
`components/ui/` or a new shape in `lib/types.ts`, ask in the group and Bilal
adds it once, for everyone. Two buttons is how two screens stop matching.

## Layout

```
app/
  (guest)/      /, /login, /scan, /c/[id], /top
  (staff)/      /checkin
  (admin)/      /admin
  (display)/    /display
components/ui/  Button, Card, Banner, Countdown, Screen
lib/
  types.ts      every shape that crosses the wire
  config.ts     timings, brand, poll intervals
  api.ts        the only door to the server
  mocks.ts      the fake backend
  time.ts       server-corrected countdowns
  useMe.ts      the guest state hook
db/             migrations, RLS, Postgres functions
```

## Non-negotiables

1. Screens never import `@supabase/supabase-js`. Everything goes through
   `lib/api.ts`.
2. The server decides everything. The client never computes a score and never
   sends a timestamp.
3. Never show a raw error code — `<ErrorNote>` turns an `ApiError` into a
   sentence.
4. Use `lib/time.ts` for countdowns, never `Date.now()`.
5. Guest screens poll; only display and admin may use realtime.
6. Every screen handles loading, empty, error and offline.
7. Nothing tappable under 48px.
