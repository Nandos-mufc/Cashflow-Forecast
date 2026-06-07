# Runway

Cashflow forecasting for international and expat financial advisers.

This repo is the **deployable product**: the modelling engine you've been
reviewing, now wrapped with sign-in, a client list, and saving — so plans
persist between sessions and you can manage many clients.

---

## What's here

```
runway/
├─ app/                      the pages
│  ├─ login/page.jsx         sign in / create account
│  ├─ page.jsx               client dashboard (list / create / open)
│  └─ plan/[clientId]/page.jsx   the plan editor + autosave
├─ components/
│  ├─ RunwayApp.jsx          the model/engine (same code we've built)
│  └─ RouteGuard.jsx         keeps signed-out users out
├─ lib/
│  ├─ supabaseClient.js      connection to your database
│  ├─ AuthProvider.jsx       who's signed in
│  ├─ store.js               load/save clients & plans
│  └─ defaultPlan.js         the shape of a blank plan
└─ supabase/schema.sql       the database tables + security rules
```

## How saving works (the one design decision worth knowing)

Each **client** is a household. Each client has one or more **plans**
(scenarios). A plan stores the *entire* model state as a single JSON blob in
the `data` column. We deliberately did **not** split assets, incomes, etc. into
separate database tables: keeping it as one JSON document means the model can
keep evolving (new fields, new features) **without database migrations**. It's
a standard, robust pattern for document-shaped data like a financial plan.

Security is enforced by the database itself (Row Level Security): an adviser can
only ever read or write their own clients and plans, even if the app had a bug.

---

## Setup (about 15 minutes, no coding required)

### 1. Create a free Supabase project
- Go to https://supabase.com, sign up, click **New project**.
- Pick a name and a strong database password (save it somewhere).
- Wait ~2 minutes for it to provision.

### 2. Create the tables
- In Supabase, open **SQL Editor** → **New query**.
- Open `supabase/schema.sql` from this repo, copy all of it, paste it in, click **Run**.
- You should see "Success". That's your database ready.

### 3. Get your two keys
- In Supabase: **Project Settings → API**.
- Copy the **Project URL** and the **anon public** key.

### 4. Run it locally (optional, to try before deploying)
You'll need [Node.js](https://nodejs.org) (the "LTS" version) installed.
```bash
cp .env.local.example .env.local      # then paste your URL + anon key into .env.local
npm install
npm run dev
```
Open http://localhost:3000, create an account, and you're in.

### 5. Deploy to Vercel (the live version)
- Push this folder to a GitHub repo.
- Go to https://vercel.com, **Add New → Project**, import the repo.
- Under **Environment Variables**, add:
  - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
- Click **Deploy**. You'll get a live URL.

### 6. Email confirmation (your choice)
By default Supabase emails a confirmation link on sign-up. For a smoother demo,
you can turn it off: **Supabase → Authentication → Providers → Email →** toggle
off "Confirm email". (Turn it back on before real-world use.)

---

## Honest notes / what's next

- **Auth is client-side** (simple and reliable for an adviser tool). If you
  later want server-rendered protection or SSO, that's a hardening step, not a
  rewrite.
- **Scenario compare** (multiple plans per client side-by-side) is supported by
  the data model already — the editor UI for switching/comparing plans is the
  natural next addition.
- **Stripe billing** plugs in at the adviser level once this is in real use.
- This step needs a developer's hands (or careful following of the guide above)
  to deploy the first time. After that, day-to-day use needs none.
