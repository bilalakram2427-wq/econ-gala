# GitHub setup

For Bilal. Fifteen minutes, start to finish.

---

## 1. Create the repo

On github.com: **New repository**.

- Owner: your account is fine. A free organisation is tidier if the society
  wants to keep it afterwards, but do not spend time on that tonight.
- Name: `econ-gala`
- **Private**
- Do **not** tick "Add a README", "Add .gitignore" or "Choose a licence" —
  this project already has them, and an initialised repo makes the first push
  awkward.

## 2. Push this project

From the unzipped folder:

```bash
cd econ-gala
git init
git add -A
git commit -m "Project skeleton, shared contract and docs"
git branch -M main
git remote add origin https://github.com/<your-username>/econ-gala.git
git push -u origin main
```

`node_modules/` and `.env.local` are already in `.gitignore`, so neither gets
pushed. Check that after the push: if you see `node_modules` on GitHub,
something went wrong.

## 3. Give the other two access

**Settings → Collaborators and teams → Add people.**

Type their GitHub usernames (ask in the group — this is one of the things the
intro message collects) and pick a role:

| Role | Can they push to main? | Can they push a branch and open a PR? |
|---|---|---|
| Read | no | no |
| Triage | no | no |
| **Write** | yes, unless you protect main | yes |
| Admin | yes, plus can change settings | yes |

Give both of them **Write**. Then protect `main` so Write does not mean they
can push straight to it:

**Settings → Branches → Add branch protection rule**

- Branch name pattern: `main`
- Tick **Require a pull request before merging**
- Set **Required approvals** to 1
- Leave everything else alone

Now the only way code reaches `main` is a pull request you approve. That is the
review step, enforced by GitHub rather than by you remembering.

They each get an email invitation and have to accept it before they can push.
Chase that tonight — a junior who cannot clone at 11pm loses a whole evening.

## 4. How they work

Each of them, once:

```bash
git clone https://github.com/<your-username>/econ-gala.git
cd econ-gala
npm install
cp .env.example .env.local
npm run dev
```

Then per piece of work:

```bash
git checkout main
git pull
git checkout -b guest/home
# ... build ...
npm run typecheck
git add -A
git commit -m "Guest home: rotating QR with 30s ring"
git push -u origin guest/home
```

Then **Compare & pull request** on GitHub, two lines on how it works, and you
review.

## 5. Reviewing

On the PR, the **Files changed** tab. What you are actually looking for:

- Did they import `@supabase/supabase-js` anywhere outside `lib/`? Reject.
- Did they edit a file they do not own? Reject, and say which.
- Did they define their own types instead of using `lib/types.ts`? Reject.
- Does `npm run typecheck` pass on their branch?
- Do the loading, error and offline states exist?
- Can they explain it in the two lines?

Short comments, merge, move on. You have six days; this is not a code review
course.

## 6. Vercel

**Add New → Project → Import** the GitHub repo. Vercel detects Next.js on its
own; accept the defaults.

Add the environment variables under **Settings → Environment Variables**:

- `NEXT_PUBLIC_USE_MOCKS` = `true` for now, flipped to `false` on Sunday
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` once the
  Supabase project exists

Every PR then gets its own preview URL automatically, which is how the other
two test the camera (it needs HTTPS and will not work over `http://` on your
local network). Merging to `main` deploys to the live URL.

## 7. Two things to do today, not later

**Use a society email** for the GitHub, Supabase and Vercel accounts, not only
your personal one. If you are unreachable on the night, someone else needs to
be able to log in.

**Touch the Supabase project every couple of days.** Free-plan projects pause
after a week of inactivity, and a paused database at 5:25pm on the 19th is the
worst possible version of this problem.
