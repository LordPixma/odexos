import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { withDb, requireAuth } from "./middleware";
import type { AppEnv } from "./lib/types";
import authRoutes from "./routes/auth";
import memberRoutes from "./routes/members";
import activityRoutes from "./routes/activities";
import expenseRoutes from "./routes/expenses";
import financeRoutes from "./routes/finance";
import dashboardRoutes from "./routes/dashboard";

const app = new Hono<AppEnv>();

// Every API request gets a Drizzle client bound to D1.
app.use("/api/*", withDb);

app.get("/api/health", (c) => c.json({ ok: true, app: c.env.APP_NAME }));

// Public auth endpoints (register / login / logout / me).
app.route("/api/auth", authRoutes);

// Everything below this line requires a valid session.
app.use("/api/*", requireAuth);
app.route("/api/members", memberRoutes);
app.route("/api/activities", activityRoutes);
app.route("/api/expenses", expenseRoutes);
app.route("/api/finance", financeRoutes);
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

export default app;
