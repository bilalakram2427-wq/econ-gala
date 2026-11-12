# Task 2 — check-in, big screen, admin

**You own:** `app/(staff)/`, `app/(admin)/`, `app/(display)/` and
`components/staff/`, `components/admin/`, `components/display/`
**You do not edit:** `lib/`, `components/ui/`, `db/`, or `app/(guest)/`
**Event:** Thursday 19 November. Everything below needs to work by **Sunday 15**.

Three surfaces, each simpler than the guest app, but two of them are the ones
250 people and the host are looking at. If the display dies, everyone notices.

---

## Before you start

```bash
git clone <repo url>
cd econ-gala
npm install
cp .env.example .env.local        # leave NEXT_PUBLIC_USE_MOCKS=true
npm run dev
```

Your three screens are at `/checkin`, `/display` and `/admin`.

Read `docs/AI-BRIEF.md` (the rules), then `docs/UI-GUIDE.md` (what the screens
look like). `app/(guest)/page.tsx` is a working example of the pattern every
screen follows — loading, error, data — copy its shape even though that screen
is not yours.

Everything runs against the fake backend in `lib/mocks.ts`. The admin state
buttons really do change the phase for the whole mock, so you can flip to
LOCKED and watch the other screens react.

---

## The screens

Build in this order: check-in is needed first on the night, the display is the
most visible, admin is the most work.

### 1. Staff check-in — `/checkin`

A volunteer at the gate with a queue in front of them. One hand, under 30
seconds per guest.

**Done when:** typing part of a name or a reg number filters the list as you
type; each result shows the full name, reg number and payment status; tapping
Check in marks them and shows **that one guest's** reg number and password
large enough to read aloud at arm's length; a Done button clears it; and
already-checked-in guests appear with a tick and no button.

**Done also when:** the checked-in / total counter is visible without
scrolling and updates after each check-in, and the whole screen is usable
one-handed on a phone — no target under 48px, no horizontal scrolling.

**The rule that matters:** never render a list of passwords. One guest, on tap,
cleared when the volunteer moves on. Someone who forgot theirs gets
`staffApi.revealCredentials()`, which shows the same credentials again without
checking them in a second time.

### 2. Display — `/display`

Projected on a big screen outdoors at dusk, running unattended for over an
hour.

**Done when:** the top 10 renders with rank, name and score, large enough to
read from ten metres; the phase and a countdown are in the corner; and the
whole thing is ivory on forest with no scrollbars, no cursor and no
interaction.

**Done also when:** turning the laptop's wifi off for a minute leaves the last
good standings on screen with a small "reconnecting" note, and it recovers on
its own when the wifi returns — no error page, no blank screen, nobody
touching it. Then close the lid for two minutes, open it, and check it comes
back by itself.

This is the one that has to survive the night unattended. Test the recovery
before you polish anything.

### 3. Admin game control — `/admin`

**Done when:** the current phase is visible at a glance; each phase button
opens a confirmation dialog naming what it does before anything happens;
pause and resume work and the guest app reflects them within five seconds; and
an illegal transition (skipping a state) shows the server's refusal as a
readable sentence instead of failing silently.

### 4. Admin overview

**Done when:** checked-in, opted-in, completed connections, live connections,
connections per minute and open flags are all on screen and refresh on their
own about every 5 seconds.

### 5. Admin leaderboard and comeback list

**Done when:** the full ranking shows points, connections, great votes and open
flags per guest, with toggles for organizers and under-review rows; and the
comeback list shows the bottom 25% with scores, clearly labelled admin-only,
ready for the host to read from.

**The rule that matters:** the comeback list never leaves the admin screen. Not
on the display, not in anything a guest can see.

### 6. Flags queue — only if everything above is done

**Done when:** each open flag shows the code, the guests involved, both learned
texts and both timings side by side, with clear and confirm buttons that
update the list.

Do not start this before Sunday. If the first five are not solid, this is the
thing we cut.

---

## Things that will bite you

**The display is the only screen allowed realtime.** Guest phones poll because
Supabase's free plan allows 200 concurrent realtime connections and we expect
250 guests. Display and admin can subscribe. If realtime is more trouble than
it is worth, poll on `POLL_MS.realtimeFallback` — nobody will notice an
8-second lag on a leaderboard.

**Projector sizing.** Use viewport units (`vw`, `vh`, `clamp()`) rather than
fixed pixels, so it fills whatever we end up plugging into. Test by making the
browser window very wide and very short.

**Confirmation dialogs are not optional.** Setting COMEBACK takes a snapshot
that cannot be undone, and setting LOCKED ends the game. Someone will have a
drink in their hand when they press these.

**Check-in is used at speed.** Autofocus the search box, keep results to one
tap, and make sure the keyboard appearing does not push the Check in button
off screen.

---

## When you are done

```bash
git checkout -b staff/checkin        # or display/board, admin/control
git commit -m "Check-in: search and credential reveal"
git push -u origin staff/checkin
```

Open a pull request and write two lines on how it works. Push each screen as
you finish it.

Stuck for more than 30 minutes on one thing? Say so in the group. Six days.
