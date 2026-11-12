# AI brief — Econ Gala networking game

Paste this whole file into your AI at the start of every session, before you
describe the task. It is the same for all three of us, so the code we each get
back fits together.

---

## What we are building

A mobile web app for the Econ Gala on **Thursday 19 November 2026**, an
open-air event with about 250 guests. Guests earn points by meeting new people:
each person shows a QR code that changes every 30 seconds, two people scan each
other, talk for at least two minutes, each types one thing they learned about
the other, and both submit. A big screen shows the live top 10.

The full specification is `docs/SPEC.md`. The team's amendments to it are in
`docs/DECISIONS.md` and **those win wherever the two disagree**.

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Supabase (Postgres, Auth, RLS) — the browser calls Postgres functions (RPC)
  directly through `@supabase/supabase-js`
- `react-qr-code` to draw QR codes, `html5-qrcode` to read them
- Deployed on Vercel

One app, one deploy. Route groups separate the four surfaces:
`(guest)`, `(staff)`, `(admin)`, `(display)`.

## Folder layout

```
app/
  (guest)/      /, /login, /scan, /c/[id], /top
  (staff)/      /checkin
  (admin)/      /admin
  (display)/    /display
components/
  ui/           shared primitives — Button, Card, Banner, Countdown, Screen
  guest/  staff/  admin/  display/
lib/            types, config, api, mocks, time, useMe
db/             migrations, RLS, Postgres functions
docs/           this brief, the spec, the task cards
```

## The ten rules

1. **Screens never import `@supabase/supabase-js`.** Everything goes through
   `lib/api.ts`. If your AI writes `supabase.from(...)` in a component, that is
   wrong, delete it and use the api function.
2. **The server decides everything.** The client never computes a score, never
   decides whether an action is allowed, and never sends a timestamp. Send the
   request; handle the answer.
3. **Never show a raw error code.** Catch `ApiError`, read `.code`, render
   `ERROR_TEXT[code]` — the `<ErrorNote>` component does this for you.
4. **Use the server clock.** `lib/time.ts` corrects for the phone's clock being
   wrong. Use `secondsUntil()` and `secondsSince()` from there, never
   `Date.now()`, in anything a guest sees counting down.
5. **Poll, do not subscribe.** Guest screens use `poll()` from `lib/api.ts` or
   the `useMe()` hook. Supabase's free plan allows 200 concurrent realtime
   connections and we expect 250 guests. Only the display and admin pages may
   use realtime.
6. **Only edit folders you own.** Need something in `components/ui` or a new
   shape in `lib/types.ts`? Ask in the group; Bilal adds it once, for everyone.
7. **Types come from `lib/types.ts`.** Do not redefine a shape locally and do
   not use `any`. If a field you need does not exist, that is a question, not a
   thing to invent.
8. **Every screen handles four states**: loading, empty, error, and offline. A
   blank screen in a dark park with no signal is the failure we are avoiding.
9. **48px minimum on anything tappable.** It is dark, people are standing, many
   are holding a drink.
10. **No feature that is not in the spec or the decisions.** If your AI offers
    a nice extra, say no. We have six days.

## Working with your AI

Use it as much as you like, with two conditions.

**You must be able to explain what you merged.** Two lines in the pull request
on how your part works. Not for marking — if nobody can explain the submit
button at 6pm on the night, nobody can fix it either.

**Give it the real files.** Paste this brief, then `lib/types.ts` and
`lib/api.ts`, then your task card, then the one screen you are building. AI that
guesses at the API contract writes code that compiles and does not work.

A prompt that works:

> Here is the project brief, the shared types and the API client. I am building
> the [screen name] screen described in my task card below. Use only the api
> functions provided, use the shared UI components from `@/components/ui`, and
> handle the loading, error and offline states. Do not add features the card
> does not mention.

## Running it

```bash
npm install
cp .env.example .env.local      # leave NEXT_PUBLIC_USE_MOCKS=true for now
npm run dev
```

Everything runs against the fake backend in `lib/mocks.ts` until the database
is live — logins, scanning, the timer, scoring, flags. Test logins and test scan
codes are listed in the comment at the top of that file. When Bilal says the
backend is ready, flip `NEXT_PUBLIC_USE_MOCKS=false` and add the two Supabase
values he sends.

Before you push: `npm run typecheck`. If it fails, fix it before anyone else
pulls it.

## Git

```bash
git checkout -b guest/home          # or staff/checkin, admin/flags, etc.
git add -A
git commit -m "Guest home: rotating QR with 30s ring"
git push -u origin guest/home
```

Then open a pull request on GitHub and write the two lines. Bilal reviews and
merges. **Push small and often** — a branch that lives three days is a merge
conflict with a countdown attached.
