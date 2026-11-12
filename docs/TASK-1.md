# Task 1 — the guest app

**You own:** `app/(guest)/` and `components/guest/`
**You do not edit:** `lib/`, `components/ui/`, `db/`, or the other route groups
**Event:** Thursday 19 November. Everything below needs to work by **Sunday 15**.

One surface, but it is the game. If this works, the night works.

---

## Before you start

```bash
git clone <repo url>
cd econ-gala
npm install
cp .env.example .env.local        # leave NEXT_PUBLIC_USE_MOCKS=true
npm run dev
```

Open `http://localhost:3000` and log in with `FA24-BED-001` / `test123`.

Read `docs/AI-BRIEF.md` (the rules), then `docs/UI-GUIDE.md` (what the screens
look like). `app/(guest)/page.tsx` is a working example of the pattern every
screen follows — copy its shape.

Everything runs against the fake backend in `lib/mocks.ts`. Test logins and
test scan codes are in the comment at the top of that file. The fake backend
behaves like the real one, including the errors, so build against it with
confidence.

---

## The screens

Build them in this order. Each one is useful on its own, so push each as you
finish it rather than saving them all up.

### 1. Login — `/login`

**Done when:** typing `FA24-BED-001` and `test123` logs in and lands on `/`;
`sp26-eco-071` in lowercase also logs in, because reg formats vary and the form
only normalizes rather than validating; a wrong password shows a readable
sentence, not a code; and the button shows a busy state while the request is in
flight and cannot be double-tapped.

Use `normalizeRegNo()` from `lib/config.ts`. Do not write a regex for the reg
number format — there is more than one format and a wrong guess locks out real
guests at the gate.

### 2. The gate and Join — `/`

**Done when:** logging in as `FA24-BED-999` shows the "see you at the gate"
screen with no way past it; logging in as `FA24-BED-002` shows the consent text
and a Join button that calls `api.optin()` and moves on; and `FA24-BED-001`
goes straight through to the home screen.

### 3. Home with the rotating QR — `/`

The most important screen in the project.

**Done when:** the QR is drawn and replaced every 30 seconds, the ring empties
over each window, the 6-digit code shows underneath and is large enough to read
out to someone standing next to you, and score and connection count are on
screen — **and** with the laptop's wifi switched off for 60 seconds the QR keeps
rotating off the cached `next_token`, then shows a quiet "reconnecting" line
instead of going blank, and recovers on its own when the wifi comes back.

That last clause is the whole point. Test it by actually turning the wifi off.

### 4. Scan — `/scan`

**Done when:** the camera opens and reading a QR calls `api.scan()`; the typed
6-digit path works with the camera closed; test codes `333333`, `444444`,
`555555` and `666666` each show their own readable sentence; and denying camera
permission shows a short how-to-fix note with manual entry still working.

### 5. Waiting for a partner to scan back

**Done when:** scanning `111111` shows the waiting screen with the partner's
name and a 90-second countdown, and moves to the conversation screen on its own
within about 5 seconds; scanning `222222` sits there and returns to home when
the countdown expires; and Cancel ends it immediately.

### 6. Conversation — `/c/[id]`

**Done when:** the partner's name, the three starters and a countdown to the
minimum chat time are on screen; both buttons are disabled until the timer has
finished *and* the text is 15–140 characters, with a visible reason why;
pressing Great or Skip submits once and shows the waiting-for-partner state;
and the result appears with the new total when the partner submits.

**Done also when:** pressing the button twice quickly, or retrying after a
failed request, produces exactly one submission — the idempotency key is
generated once on mount, not per press.

### 7. Top 10 — `/top`

**Done when:** the list renders, refreshes about every 10 seconds without a
page reload, and shows nothing about the guest's own rank unless they are in
the ten.

### 8. System states

**Done when:** from the admin screen (ask whoever has Task 2, or set it
yourself in the mock) each of these changes what the guest sees within five
seconds, with no reload and no blank screen: pause, state `CHECKIN`, state
`LOCKED`, and being offline.

---

## Things that will bite you

**The phone clock.** Guests' phones are minutes out. Use `secondsUntil()` and
`secondsSince()` from `lib/time.ts` for anything counting down. `useMe()`
already syncs the offset for you.

**Camera needs HTTPS.** It will not work on `http://192.168.x.x` from another
phone. Test on `localhost`, or on the Vercel preview URL once we have one.

**One useMe per screen.** Do not add a second poller on the same screen. If you
need an immediate refresh after an action, call the `refresh()` that `useMe()`
returns.

**Submit disabled is not security.** The server checks the timer and the text
again. Your job is to explain, not to enforce.

---

## When you are done

```bash
git checkout -b guest/<screen>
git commit -m "Guest: <what it does>"
git push -u origin guest/<screen>
```

Open a pull request and write two lines on how it works. Push each screen as
you finish it — do not hold them all to the end.

Stuck for more than 30 minutes on one thing? Say so in the group. Six days.
