# UI guide

What every screen looks like, so two people building different screens produce
one app. Read the house rules, then your own screens.

---

## House rules

**Colours** (already in Tailwind as `ivory`, `bronze`, `forest`):

| Token | Hex | Used for |
|---|---|---|
| ivory | `#F3EEE5` | page background on guest, staff, admin |
| bronze | `#7A5C2E` | buttons, numbers, links, accents |
| forest | `#14201B` | text, and the background of the display screen |

**Type.** Cormorant Garamond for headings (`font-heading`), Jost for everything
else (`font-body`). Both are already loaded in `app/layout.tsx`.

**Layout.** Every guest and staff screen is wrapped in `<Screen>`, which gives
one max width and one 16px gutter. No horizontal scrolling, ever. Design for a
375px-wide phone and check at 320px.

**Touch.** Nothing tappable under 48px tall. Buttons go full width on guest
screens. Leave 12px between two tappable things.

**Conditions.** This is an outdoor evening event. Light grey on white is
invisible at dusk at full brightness — body text is `text-forest`, and the
lightest you may go for anything that must be read is `text-forest/60`.

**Use the shared components.** `Button`, `Card`, `Stat`, `Banner`, `ErrorNote`,
`Countdown`, `CountdownRing`, `Screen`, `CenteredNote`, `Loading` — all from
`@/components/ui`. Do not write a second button.

**Every screen has four states.** Loading (`<Loading/>`), ready, error
(`<ErrorNote/>`), and offline (a banner, with whatever was last fetched still
on screen). A blank screen is a bug.

**Tone.** Short, warm, plain. "See you at the gate", not "Access denied: guest
not checked in."

---

## Guest screens — Task 1

The guest app is one column, ivory background, everything reachable with a
thumb.

### Login — `/login`

```
┌──────────────────────────────┐
│                              │
│         Econ Gala            │   ← font-heading, 3xl, centred
│   Econ Ascent networking      │
│                              │
│  Registration number         │
│  ┌────────────────────────┐  │   ← autocapitalize, 16px font
│  │ FA24-BED-001           │  │     (anything smaller zooms on iOS)
│  └────────────────────────┘  │
│  Password                    │
│  ┌────────────────────────┐  │
│  │ ••••••                 │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │        Log in          │  │   ← full width, busy state while waiting
│  └────────────────────────┘  │
│                              │
│  A volunteer gives you these │   ← text-forest/60, small
│  when you check in.          │
└──────────────────────────────┘
```

Wrong password shows `ERROR_TEXT.BAD_CREDENTIALS` above the button. Success
goes to `/`. Login works whether or not the guest is checked in — the gate is
the home screen's job, not this one's.

### Gate — `/` when `checked_in` is false

Use `<CenteredNote heading="See you at the gate">`. One friendly line. No
buttons. The screen picks up the change on its own within five seconds of the
volunteer checking them in, because `useMe()` keeps polling — do not make them
reload.

### Join — `/` when `opted_in` is false

```
┌──────────────────────────────┐
│  Join the game               │
│                              │
│  You will appear as          │
│         Bilal R.             │   ← font-heading, 2xl, bronze
│                              │
│  Short consent text: what we │   ← spec section 18
│  store, that the big screen  │
│  shows first name and last   │
│  initial, and that we delete │
│  it within 7 days.           │
│                              │
│  ┌────────────────────────┐  │
│  │     Join the game      │  │   ← calls api.optin()
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Home — `/`

The screen a guest spends most of the night on.

```
┌──────────────────────────────┐
│  Bilal R.                    │
│  ┌──────────────────────┐    │   ← phase banner, only when it matters
│  │ Game closes in 12:04 │    │     (paused, not started, closed)
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │                      │    │
│  │    ███ ▀▀█ ███       │    │   ← QR, as wide as the card,
│  │    █▀█ ██▄ ▄█▀       │    │     square, high contrast
│  │    ███ ▄▄█ ███       │    │
│  │                      │    │
│  │   ◴  4 9 2 7 1 3     │    │   ← ring + 6-digit code, large,
│  │                      │    │     spaced so it can be read aloud
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │    12    │     6     │    │   ← two <Stat>s in one <Card>
│  │  POINTS  │ PEOPLE MET│    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │     Scan someone     │    │   ← full width, primary
│  └──────────────────────┘    │
│        See the top 10        │   ← text link
└──────────────────────────────┘
```

The QR is the point of this screen. Make it big — most of the width — with real
white quiet space around it, because a dim phone being read by another dim
phone in a park needs all the contrast it can get.

**The network-drop rule.** `api.qr()` returns the current token *and* the next
one. Fetch once per 30-second window and keep both. When the window ends, swap
to the cached next token immediately and fetch again in the background. If that
fetch fails, keep showing the token you have and put up a quiet "reconnecting"
line. **The QR must never go blank or show a spinner in place of the code.**
This is the single most important behaviour in Task 1.

When someone scans you, `me().pending_connection` appears. Show it as a banner
with the partner's name — "Ayesha K. wants to connect. Scan their code back."

### Scan — `/scan`

```
┌──────────────────────────────┐
│  ← Back            Scan      │
│  ┌──────────────────────┐    │
│  │                      │    │
│  │   [camera preview]   │    │   ← square, with a visible frame
│  │                      │    │
│  └──────────────────────┘    │
│  Point at their code.        │
│                       [ ☀ ]  │   ← torch toggle, if supported
│  ─────────  or  ───────────  │
│  Type their 6-digit code     │
│  ┌────────────────────────┐  │   ← numeric keypad
│  │ 4 9 2 7 1 3            │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

Try `window.BarcodeDetector` first — it is native and fast where it exists —
and fall back to `html5-qrcode`. If the camera is blocked, replace the preview
with a short note on how to allow it in Safari and Chrome, and leave the manual
entry working. Camera needs HTTPS, so it will not work on `http://` over your
local network; use `localhost` or the Vercel URL for testing.

### Waiting for them to scan back

```
┌──────────────────────────────┐
│  Waiting for Ayesha K.       │
│                              │
│         ◴  1:12              │   ← <Countdown to={expires_at}>
│                              │
│  Ask them to scan your code. │
│                              │
│        Cancel                │   ← ghost button, api.cancelPending()
└──────────────────────────────┘
```

Polls every 3 seconds. When `me().active_connection` appears, go straight to
`/c/[id]`.

### Conversation — `/c/[id]`

The heart of the game, and the screen with the most states.

```
┌──────────────────────────────┐
│  You are talking to          │
│        Ayesha K.             │   ← big, so they can check it is the
│                              │     right person in front of them
│  ┌──────────────────────┐    │
│  │ Try one of these:    │    │   ← the three starters
│  │ • What did you change│    │
│  │   your mind about?   │    │
│  │ • Which class...     │    │
│  │ • What is the best...│    │
│  └──────────────────────┘    │
│                              │
│         1:43 to go           │   ← counts down to min_chat_seconds
│                              │
│  One thing you learned       │
│  ┌────────────────────────┐  │
│  │                        │  │   ← textarea, 3 rows
│  └────────────────────────┘  │
│                      18/140  │   ← counter; red under 15, red over 140
│                              │
│  ┌─────────────┐┌──────────┐ │
│  │ Great chat  ││   Skip   │ │   ← both submit; one sets vote='great'
│  └─────────────┘└──────────┘ │
└──────────────────────────────┘
```

Both buttons stay disabled until the timer has finished **and** the text is
15–140 characters. Say why they are disabled rather than leaving the guest
guessing: "Keep talking — 1:43 to go" or "A few more characters".

Generate the idempotency key **once** when the screen mounts
(`crypto.randomUUID()`) and reuse it on every retry. A fresh key on a retry can
score the connection twice.

After submitting:

```
│  Sent. Waiting for Ayesha... │
│         ◴  8:12              │   ← until submit_by
```

and when `active_connection` clears and the score jumps:

```
│          +2                  │   ← large, bronze, brief animation
│     You have 14 points       │
│  ┌──────────────────────┐    │
│  │     Back to my code  │    │
│  └──────────────────────┘    │
```

### Top 10 — `/top`

Plain numbered list, rank / name / score. Refresh every 10 seconds. Never show
the guest their own rank if they are not in it, and never show a bottom list.

### System states

| When | Show |
|---|---|
| `paused` | amber banner, "The game is paused. Hold on a moment." Scan button disabled |
| state is `CHECKIN` | "The game has not started yet." |
| state is `LOCKED` or later | "The game is closed. Scores are final." Keep the score visible |
| session expired | back to `/login` with one line of explanation |
| offline | quiet banner; keep the last data on screen; never a blank page |

---

## Staff, display and admin — Task 2

### Staff check-in — `/checkin`

Used one-handed, standing at a gate, under time pressure, with a queue. Big
targets, few words. The target is under 30 seconds per guest.

```
┌──────────────────────────────┐
│  Check in        143 / 250   │   ← counter always visible
│  ┌────────────────────────┐  │
│  │ 🔍 name or reg number  │  │   ← autofocus, large
│  └────────────────────────┘  │
│  ┌──────────────────────┐    │
│  │ Ayesha Khan          │    │
│  │ FA24-BED-003 · paid  │    │
│  │ ┌──────────────────┐ │    │
│  │ │    Check in      │ │    │   ← big, primary
│  │ └──────────────────┘ │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │ Omar Farooq          │    │
│  │ FA24-BED-004 · unpaid│    │
│  │ ┌──────────────────┐ │    │
│  │ │    Check in      │ │    │
│  │ └──────────────────┘ │    │
│  └──────────────────────┘    │
└──────────────────────────────┘
```

After the tap, that one card becomes the credentials:

```
│  ┌──────────────────────┐    │
│  │ ✓ Ayesha Khan        │    │
│  │                      │    │
│  │   FA24-BED-003       │    │   ← both large enough to read aloud
│  │   k7m2qp             │    │     at arm's length
│  │                      │    │
│  │ Type these into your │    │
│  │ own phone.           │    │
│  │            [ Done ]  │    │   ← clears it from the screen
│  └──────────────────────┘    │
```

**Never render a list of passwords.** One guest, on tap, cleared when the
volunteer is finished. Someone who forgot theirs gets
`staffApi.revealCredentials()`, which shows the same thing again without
checking them in twice.

Already-checked-in guests still appear in search, with a ✓ and no button.

### Display — `/display`

Dark. Runs for over an hour on a laptop nobody touches, projected onto a screen
outdoors at dusk.

```
┌────────────────────────────────────────────────┐
│  ECON GALA                        GAME · 12:04 │   ← phase + countdown
│                                                │
│   1   Ayesha K. ......................  18     │   ← huge. 48px+ per row.
│   2   Hamza S.  ......................  17     │     Readable from 10 metres.
│   3   Zara M.   ......................  15     │
│   4   Omar F.   ......................  14     │
│   5   Sana T.   ......................  13     │
│   6   Bilal R.  ......................  12     │
│   7   Ali N.    ......................  11     │
│   8   Mina J.   ......................   9     │
│   9   Usman A.  ......................   8     │
│  10   Fatima Q. ......................   7     │
│                                                │
│                              [reconnecting...] │   ← only when it drops
└────────────────────────────────────────────────┘
```

Ivory text on forest. No interaction, no scrollbars, no cursor. Scale with
viewport units so it fills whatever projector it lands on.

**It must heal itself.** If the network drops or the laptop sleeps, it
reconnects and carries on with nobody touching it. Keep the last good data on
screen and show a small "reconnecting" note — never an error page, never a
blank screen in front of 250 people. Test it by turning the wifi off and on.

Animate rank changes if you have time at the end. Not before everything else
works.

### Admin — `/admin`

Desktop, used by two or three people who know what they are doing. Dense is
fine here; clarity matters more than beauty.

```
┌──────────────────────────────────────────────┐
│  Admin                        GAME  [ Pause ]│
│  ┌────┬────┬────┬────┬────┬────┐             │
│  │143 │128 │212 │ 23 │ 17 │  3 │             │   ← overview counters
│  │ in │join│done│live│/min│flag│             │
│  └────┴────┴────┴────┴────┴────┘             │
│                                              │
│  Phase    [SETUP][CHECKIN][GAME][COMEBACK]   │   ← current one highlighted;
│           [LOCKED][VERIFIED][REVEALED]       │     each opens a confirm dialog
│                                              │
│  ── Leaderboard ──────────────────────────   │
│  #  Name        Pts  Conns  Greats  Flags    │
│  1  Ayesha K.    18     9      7      0      │
│  2  Hamza S.     17     9      6      1  ⚠   │   ← under review, marked
│  ...                                         │
│  [ ] show organizers  [ ] show under review  │
│                                              │
│  ── Comeback (admin only) ────────────────   │
│  Bottom 25% at the snapshot — for the host   │
│  Ali N. 2 · Mina J. 2 · Usman A. 1 · ...     │
└──────────────────────────────────────────────┘
```

Every state button opens a confirmation dialog naming what it does — "Set
COMEBACK? This takes the snapshot and cannot be undone." The server refuses any
transition that skips a state; show the error rather than trying to prevent it
in the UI.

The comeback list is **admin only**. It is never on the display, never in an
API response to a guest, and never read out by name.

Flags queue, if there is time: each flag with the pair, both learned texts and
both timings side by side, and clear / confirm buttons.
