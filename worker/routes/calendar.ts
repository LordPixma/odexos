import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { activities, chores, families, users } from "../db/schema";
import { createDb } from "../db/client";
import { generateToken } from "../lib/crypto";
import { buildFamilyFeed } from "../lib/ics";
import { toActivity, toMember } from "../lib/serialize";
import { appOrigin } from "../lib/bank";
import type { AppEnv, Bindings } from "../lib/types";
import type { Context } from "hono";

/** What the feed URL's query string can switch off. */
function feedParts(c: Context): {
  plans: boolean;
  birthdays: boolean;
  chores: boolean;
} {
  const off = (name: string) => c.req.query(name) === "0";
  return {
    plans: !off("plans"),
    birthdays: !off("birthdays"),
    chores: !off("chores"),
  };
}

/**
 * Public ICS feed. Authenticated by the unguessable token in the path, which is
 * how calendar subscriptions work everywhere — the client has nowhere to put a
 * session cookie. Rotating the token invalidates every subscription.
 *
 * Mounted before the auth gate, so it does its own database setup.
 */
export async function calendarFeed(c: Context<{ Bindings: Bindings }>) {
  const token = c.req.param("token")?.replace(/\.ics$/, "") ?? "";
  // Tokens are 64 hex characters; reject anything else without touching D1.
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return c.text("Not found", 404);
  }

  const db = createDb(c.env.DB);
  const family = await db.query.families.findFirst({
    where: eq(families.calendarToken, token),
  });
  if (!family) return c.text("Not found", 404);

  const parts = feedParts(c);

  // Base activities only — recurring series become RRULEs, so there's nothing
  // to expand here.
  const activityRows = parts.plans
    ? await db.query.activities.findMany({
        where: eq(activities.familyId, family.id),
        limit: 2000,
      })
    : [];

  const memberRows = await db.query.users.findMany({
    where: eq(users.familyId, family.id),
  });

  const choreRows = parts.chores
    ? await db.query.chores.findMany({
        where: and(eq(chores.familyId, family.id), eq(chores.archived, false)),
        limit: 500,
      })
    : [];

  const members = memberRows.map(toMember);
  const body = buildFamilyFeed({
    familyName: family.name,
    activities: activityRows.map(toActivity),
    members: parts.birthdays ? members : members.map((m) => ({ ...m, birthday: null })),
    chores: choreRows.map((ch) => ({
      id: ch.id,
      title: ch.title,
      notes: ch.notes,
      cadence: ch.cadence,
      dueDate: ch.dueDate,
      assignedTo: ch.assignedTo,
    })),
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${family.name.replace(/[^\w -]/g, "")}.ics"`,
      // Calendar clients poll on their own schedule; a short cache keeps a
      // subscribed household from hammering D1 without making edits feel stale.
      "Cache-Control": "public, max-age=900",
      // The token is the credential — keep the URL out of referrers and caches
      // that aren't ours.
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// --- Authenticated subscription management ---

const app = new Hono<AppEnv>();

function feedUrl(c: Context<AppEnv>, token: string): string {
  return `${appOrigin(c.env, c)}/api/calendar/feed/${token}.ics`;
}

/** The family's subscribe URL, minting a token the first time it's asked for. */
app.get("/subscription", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const family = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  if (!family) return c.json({ error: "Family not found" }, 404);

  let token = family.calendarToken;
  if (!token) {
    token = generateToken();
    await db
      .update(families)
      .set({ calendarToken: token })
      .where(eq(families.id, user.familyId));
  }
  return c.json({ url: feedUrl(c, token) });
});

/** Rotate the token — used when a link has been shared too widely. */
app.post("/subscription/rotate", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  if (user.role !== "owner" && user.role !== "adult") {
    return c.json({ error: "Only owners and adults can reset the link" }, 403);
  }
  const token = generateToken();
  await db
    .update(families)
    .set({ calendarToken: token })
    .where(eq(families.id, user.familyId));
  return c.json({ url: feedUrl(c, token) });
});

export default app;
