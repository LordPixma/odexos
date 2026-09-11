import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { withDb, requireAuth } from "./middleware";
import type { AppEnv, Bindings } from "./lib/types";
import { createDb } from "./db/client";
import { syncConnection } from "./lib/bank";
import { checkBudgetAlerts } from "./lib/notifications";
import { sendDigest } from "./lib/digest";

const WEEKLY_DIGEST_CRON = "0 7 * * 1"; // Monday 07:00 UTC
import authRoutes from "./routes/auth";
import memberRoutes from "./routes/members";
import activityRoutes from "./routes/activities";
import expenseRoutes from "./routes/expenses";
import financeRoutes, { bankCallback } from "./routes/finance";
import dashboardRoutes from "./routes/dashboard";
import householdRoutes from "./routes/household";
import notificationRoutes from "./routes/notifications";
import familyRoutes from "./routes/family";

const app = new Hono<AppEnv>();

// Every API request gets a Drizzle client bound to D1.
app.use("/api/*", withDb);

app.get("/api/health", (c) => c.json({ ok: true, app: c.env.APP_NAME }));

// Public auth endpoints (register / login / logout / me).
app.route("/api/auth", authRoutes);

// Public bank OAuth callback — secured by its one-time `state`, so it must sit
// BEFORE the auth gate (the browser arrives here redirected from the provider).
app.get("/api/finance/connections/callback", bankCallback);

// Everything below this line requires a valid session.
app.use("/api/*", requireAuth);
app.route("/api/members", memberRoutes);
app.route("/api/activities", activityRoutes);
app.route("/api/expenses", expenseRoutes);
app.route("/api/finance", financeRoutes);
app.route("/api/household", householdRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/family", familyRoutes);
app.route("/api/dashboard", dashboardRoutes);

// Unknown API routes → JSON 404 (never fall through to the SPA).
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Fallback: serve the built SPA. In production `run_worker_first` means only
// /api/* reaches the Worker, so this mainly matters for local `wrangler dev`.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Something went wrong" }, 500);
});

// Cron Triggers: 6-hourly (bank sync + budget alerts) and weekly (digest).
async function scheduled(
  controller: ScheduledController,
  env: Bindings,
  _ctx: ExecutionContext,
): Promise<void> {
  const db = createDb(env.DB);

  // Weekly family digest (Monday morning).
  if (controller.cron === WEEKLY_DIGEST_CRON) {
    const digestFamilies = await db.query.families.findMany();
    for (const fam of digestFamilies) {
      try {
        await sendDigest(db, env, fam.id, false);
      } catch (err) {
        console.error(`Weekly digest failed for ${fam.id}:`, err);
      }
    }
    return;
  }

  const connections = await db.query.bankConnections.findMany();
  for (const connection of connections) {
    try {
      await syncConnection(db, env, connection);
    } catch (err) {
      console.error(`Scheduled sync failed for ${connection.id}:`, err);
    }
  }

  const allFamilies = await db.query.families.findMany();
  for (const fam of allFamilies) {
    try {
      await checkBudgetAlerts(db, env, fam.id);
    } catch (err) {
      console.error(`Budget alert check failed for ${fam.id}:`, err);
    }
  }
}

export default {
  fetch: (req: Request, env: Bindings, ctx: ExecutionContext) =>
    app.fetch(req, env, ctx),
  scheduled,
};
