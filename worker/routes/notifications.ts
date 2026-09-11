import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { notifications } from "../db/schema";
import { toNotification } from "../lib/serialize";
import { checkBudgetAlerts } from "../lib/notifications";
import type { AppEnv } from "../lib/types";
import type { NotificationsResponse } from "@shared/types";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const rows = await db.query.notifications.findMany({
    where: eq(notifications.familyId, familyId),
    orderBy: [desc(notifications.createdAt)],
    limit: 50,
  });
  const unread = rows.filter((n) => n.readAt === null).length;
  return c.json<NotificationsResponse>({
    notifications: rows.map(toNotification),
    unread,
  });
});

app.post("/read", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.familyId, familyId), isNull(notifications.readAt)));
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.familyId, familyId)));
  return c.json({ ok: true });
});

// Manually run the budget-alert check (also runs on the 6-hourly cron).
app.post("/check", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const created = await checkBudgetAlerts(db, c.env, familyId);
  return c.json({ created });
});

export default app;
