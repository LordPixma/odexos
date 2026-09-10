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
| 📊 **Finance** | Track current accounts, savings, cards, investments and pensions. Automatic **net-worth** (assets − liabilities). Built to plug into Open Banking (TrueLayer / Plaid) later. |
| 🏠 **Dashboard** | One glance: today's schedule, the week ahead, this month's spend by category, and the family's financial posture. |

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

## Roadmap

The MVP is deliberately a solid base to build the full vision on. Natural next
steps:

- **Open Banking / bank sync** — connect real accounts via TrueLayer or Plaid so
  balances and transactions update automatically. The `accounts` table already
  carries `provider` / `external_ref` fields for this.
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
