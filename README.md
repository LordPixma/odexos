# OdexOS

**Your family's operations command center — on Cloudflare.**

OdexOS is a single portal where everything the family does lives in one place:
school runs, clubs, meetings, weekend plans, shared expenses, and a live view of
the family's financial posture. Anyone in the family can sign in and immediately
see where things stand in any area.

This repository is the foundation: a working, deployable full-stack app running
**entirely on Cloudflare's platform**.

---

## What's in the MVP

| Module | What it does |
| --- | --- |
| 🔐 **Accounts & family** | Create a family, invite members, role-based access (owner / adult / child / member). Session-cookie auth with PBKDF2-hashed passwords. |
| 🗓️ **Activities** | School runs, clubs, meetings, weekend plans, appointments and chores — assign to a family member, set times/locations, grouped by day. |
| 💷 **Expenses** | Log family spending by category and payer, filter by month, see monthly totals and category breakdowns. |
| 📊 **Finance** | Track current accounts, savings, cards, investments and pensions. Automatic **net-worth** (assets − liabilities). **Connect real banks via Open Banking (TrueLayer)** to sync balances automatically. |
| 🧾 **Transactions** | Bank transactions synced from linked accounts, **auto-categorised**, with monthly spending insights (by category + top merchants). Re-categorise any transaction; overrides stick. |
| 🎯 **Budgets & alerts** | Monthly limits by category (and an overall cap), tracked against **combined** manual expenses + synced bank spend. Colour-coded progress, with warning (≥80%) and over-budget (≥100%) alerts surfaced on the Budgets page and the Dashboard. |
| 🏠 **Dashboard** | One glance: today's schedule, the week ahead, **combined** month spend (manual + bank) by category, income, recent bank activity, budget alerts, and the family's financial posture. |

---

## Architecture

Everything runs on Cloudflare — no other infrastructure required.

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                      │
│                                                           │
│   React SPA (Vite build)        Hono API (/api/*)         │
│   served via Workers Assets  →  auth · activities ·       │
│   (SPA fallback routing)        expenses · finance ·      │
│                                 dashboard · members       │
│                                        │                  │
│                                        ▼                  │
│                             Cloudflare D1 (SQLite)        │
│                             via Drizzle ORM               │
└─────────────────────────────────────────────────────────┘
```

- **Frontend** — React 18 + TypeScript + Vite + Tailwind CSS, React Router,
  TanStack Query. Built to `dist/` and served by the Worker's Assets binding,
  with a single-page-application fallback so deep links work.
- **API** — [Hono](https://hono.dev) running in a Cloudflare Worker. Only
  `/api/*` is routed to the Worker (`run_worker_first`); everything else is a
  static asset.
- **Database** — [Cloudflare D1](https://developers.cloudflare.com/d1/) with
  [Drizzle ORM](https://orm.drizzle.team). Migrations are generated from the
  schema and applied with Wrangler.
- **Auth** — opaque session tokens stored in D1, delivered as an HttpOnly,
  SameSite=Lax cookie. Passwords hashed with PBKDF2 via the Web Crypto API (no
  native dependencies).

### Project layout

```
odexos/
├── worker/                 # Cloudflare Worker (Hono API)
│   ├── index.ts            # app entry: routing, auth gate, SPA/asset fallback
│   ├── middleware.ts       # per-request DB client + requireAuth
│   ├── db/
│   │   ├── schema.ts       # Drizzle schema (source of truth for the DB)
│   │   └── client.ts       # Drizzle ↔ D1 binding
│   ├── lib/                # crypto, auth/sessions, validation, serializers
│   └── routes/             # auth, members, activities, expenses, finance, dashboard
├── src/                    # React frontend
│   ├── pages/              # Dashboard, Activities, Expenses, Finance, Family, Auth
│   ├── components/         # layout, icons, UI primitives
│   └── lib/                # api client, auth context, query hooks, formatting
├── shared/types.ts         # domain types shared by worker + frontend
├── migrations/             # generated D1 SQL migrations
├── wrangler.jsonc          # Cloudflare Worker + D1 + Assets config
└── vite.config.ts          # frontend build + dev proxy to the Worker
```

---

## Getting started

### Prerequisites

- Node.js 20+ (developed on Node 22)
- A Cloudflare account (free tier is fine) for deploying

### 1. Install

```bash
npm install
```

### 2. Create the D1 database

```bash
npx wrangler d1 create odexos-db
```

Copy the `database_id` from the output into `wrangler.jsonc` (replace
`REPLACE_WITH_YOUR_D1_DATABASE_ID`).

### 3. Apply migrations

```bash
npm run db:migrate:local     # local dev database
# and, once you're ready to deploy:
npm run db:migrate:remote    # the real Cloudflare D1
```

### 4. Run it locally

```bash
npm run dev
```

This starts two processes:

- **Vite** on <http://localhost:5173> (the app — open this one)
- **Wrangler** on <http://localhost:8787> (the Worker + local D1)

Vite proxies `/api/*` to the Worker automatically. Open the app, choose
**Create a family**, and you're in.

### 5. Deploy

```bash
npm run deploy
```

This builds the SPA and deploys the Worker (with the assets and D1 binding) to
your Cloudflare account.

---

## Handy scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Frontend + Worker locally, with hot reload |
| `npm run build` | Production build of the SPA into `dist/` |
| `npm run deploy` | Build + deploy the Worker to Cloudflare |
| `npm run typecheck` | Type-check both the frontend and the Worker |
| `npm run db:generate` | Regenerate SQL migrations after editing `worker/db/schema.ts` |
| `npm run db:migrate:local` / `:remote` | Apply migrations |

### Changing the data model

1. Edit `worker/db/schema.ts`.
2. `npm run db:generate` to create a new migration.
3. `npm run db:migrate:local` (and `:remote` when deploying).

---

## Bank integration (Open Banking)

The Finance module can link real bank accounts and keep their balances in sync,
all handled server-side in the Worker.

### How it works

1. **Connect** — the app asks the Worker for a consent URL and sends the browser
   to the provider. The user picks their bank and approves access.
2. **Callback** — the provider redirects back to
   `/api/finance/connections/callback`. The Worker verifies the one-time `state`,
   exchanges the authorization code for tokens, **encrypts** them (AES-256-GCM)
   and stores them in D1, then does an initial sync.
3. **Sync** — the Worker fetches each account/card balance and upserts it into the
   `accounts` table (matched on `connection_id` + `external_ref`), then pulls
   recent **transactions** into the `transactions` table (deduped per account by
   the provider's transaction id) and auto-categorises them. A **Cron Trigger**
   re-syncs every connection every 6 hours; access tokens are refreshed
   automatically.
4. **Disconnect** — removes the connection and its tokens; synced accounts are
   kept as manual entries so history and net worth are preserved.

Security notes: the client secret and all tokens stay server-side; tokens are
encrypted at rest; the OAuth `state` is single-use and short-lived; and every
connection is scoped to the signed-in member's family.

### Providers

- **`mock`** (default when no credentials are set) — a fully-working built-in
  fake bank. The entire connect → sync → disconnect flow works with zero external
  setup, which is ideal for local development and demos.
- **`truelayer`** — real UK/EU Open Banking. Selected automatically once
  credentials are present. Implemented behind a small `BankProvider` interface
  (`worker/lib/bank/`), so Plaid or another provider can be added the same way.

### Configuring TrueLayer

1. Create an app at <https://console.truelayer.com> and add your redirect URI
   (e.g. `https://<your-app>/api/finance/connections/callback`).
2. Set the secrets on the Worker:

   ```bash
   wrangler secret put TRUELAYER_CLIENT_ID
   wrangler secret put TRUELAYER_CLIENT_SECRET
   wrangler secret put ENCRYPTION_KEY        # openssl rand -base64 32
   ```

3. Set `TRUELAYER_ENV` (`sandbox` or `live`) in `wrangler.jsonc`, and optionally
   `TRUELAYER_REDIRECT_URI` / `APP_URL`.

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in the
values — or leave them blank to use the mock provider.

---

## Roadmap

The foundation now covers activities, expenses, finance, bank sync, transaction
sync with auto-categorisation **and budgets with alerts**. Natural next steps:

- **Alert delivery** — email/push when a budget is breached (in-app today; a
  Cron + email provider such as MailChannels/Resend would deliver a digest).
- **Editable category rules** — let each family teach the auto-categoriser new
  merchant → category mappings.
- **Recurring activities** — repeat rules for the weekly school run, clubs, etc.
- **Calendar sync** — two-way sync with Google Calendar / iCal feeds.
- **Budgets & alerts** — monthly budgets per category with nudges when close.
- **Shared lists & meal planning** — weekend plans, shopping, chores.
- **Notifications** — a daily family digest (Cloudflare Cron Triggers + email).

---

## Notes

- Amounts are stored as integer minor units (pence/cents) to avoid floating-point
  drift; the API accepts and returns major units where it's natural for the UI.
- All data is scoped to a family; every query is filtered by the signed-in
  member's `familyId`.
- The default currency is GBP and can be changed per family in the schema.
