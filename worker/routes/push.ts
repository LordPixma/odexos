import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "../db/schema";
import { generateId } from "../lib/crypto";
import { sendPush } from "../lib/push";
import type { AppEnv } from "../lib/types";
import { badRequest, optionalString, requireString } from "../lib/validate";

const app = new Hono<AppEnv>();

/**
 * What the browser needs before it can subscribe: the VAPID public key, and
 * whether this member already has this device registered.
 */
app.get("/config", async (c) => {
  const key = c.env.VAPID_PUBLIC_KEY ?? null;
  const db = c.get("db");
  const user = c.get("user");
  const mine = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, user.id),
    columns: { id: true, userAgent: true, createdAt: true },
  });
  return c.json({ publicKey: key, enabled: Boolean(key), devices: mine });
});

/** Register (or refresh) this browser's subscription. */
app.post("/subscribe", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const endpoint = requireString(body.endpoint, "Endpoint", { max: 1000 });
  if (!/^https:\/\//.test(endpoint)) badRequest("Endpoint must be https");
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const p256dh = requireString(keys.p256dh, "Key", { max: 200 });
  const auth = requireString(keys.auth, "Auth secret", { max: 100 });

  // The endpoint is the identity of a subscription: re-subscribing on the same
  // device returns the same URL, and it may now belong to a different member
  // on a shared computer.
  const existing = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.endpoint, endpoint),
  });

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        userId: user.id,
        familyId: user.familyId,
        p256dh,
        auth,
        userAgent: optionalString(body.userAgent, "Device", { max: 200 }),
      })
      .where(eq(pushSubscriptions.id, existing.id));
    return c.json({ ok: true, id: existing.id });
  }

  const id = generateId();
  await db.insert(pushSubscriptions).values({
    id,
    familyId: user.familyId,
    userId: user.id,
    endpoint,
    p256dh,
    auth,
    userAgent: optionalString(body.userAgent, "Device", { max: 200 }),
  });
  return c.json({ ok: true, id }, 201);
});

/** Turn notifications off for this browser. */
app.post("/unsubscribe", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const endpoint = requireString(body.endpoint, "Endpoint", { max: 1000 });
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, user.id),
      ),
    );
  return c.json({ ok: true });
});

/** Send a test notification to every device this member has registered. */
app.post("/test", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const subs = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, user.id),
  });
  if (subs.length === 0) return c.json({ error: "No devices registered" }, 400);

  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    const result = await sendPush(c.env, sub, {
      title: "OdexOS",
      body: "Notifications are working. You'll hear from us when it matters.",
      url: "/",
      tag: "test",
    });
    if (result.ok) {
      sent++;
      await db
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date().toISOString() })
        .where(eq(pushSubscriptions.id, sub.id));
    } else if (result.gone) {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, sub.id));
      removed++;
    }
  }
  return c.json({ sent, removed });
});

export default app;
