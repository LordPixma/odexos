import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { families } from "../db/schema";
import type { AppEnv } from "../lib/types";
import { optionalBool, optionalString } from "../lib/validate";
import type { FamilySettings } from "@shared/types";

const app = new Hono<AppEnv>();

function toSettings(row: {
  id: string;
  name: string;
  currency: string;
  alertEmails: boolean;
}): FamilySettings {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    alertEmails: row.alertEmails,
  };
}

app.get("/", async (c) => {
  const db = c.get("db");
  const fam = await db.query.families.findFirst({
    where: eq(families.id, c.get("user").familyId),
  });
  if (!fam) return c.json({ error: "Family not found" }, 404);
  return c.json<FamilySettings>(toSettings(fam));
});

app.patch("/", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const updates: Partial<{
    name: string;
    currency: string;
    alertEmails: boolean;
  }> = {};
  if (body.alertEmails !== undefined)
    updates.alertEmails = optionalBool(body.alertEmails, true);
  // Only owners may change the family name or currency.
  if (body.name !== undefined && user.role === "owner") {
    const name = optionalString(body.name, "Family name", { max: 120 });
    if (name) updates.name = name;
  }
  if (body.currency !== undefined && user.role === "owner") {
    const currency = optionalString(body.currency, "Currency", { max: 3 });
    if (currency) updates.currency = currency;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(families).set(updates).where(eq(families.id, user.familyId));
  }
  const fam = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  return c.json<FamilySettings>(toSettings(fam!));
});

export default app;
