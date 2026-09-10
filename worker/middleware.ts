import { createMiddleware } from "hono/factory";
import { createDb } from "./db/client";
import { currentUser } from "./lib/auth";
import type { AppEnv } from "./lib/types";

/** Attaches a per-request Drizzle client (bound to D1) to the context. */
export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

/** Requires a valid session; sets `user` on the context or returns 401. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get("db");
  const user = await currentUser(c, db);
  if (!user) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  c.set("user", user);
  await next();
});
