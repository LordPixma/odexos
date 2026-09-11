import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { families, users } from "../db/schema";
import { startSession } from "../lib/auth";
import { hashPassword, sha256Hex } from "../lib/crypto";
import { toMember } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import { requireString } from "../lib/validate";
import type { AuthState, InvitePreview } from "@shared/types";

const invites = new Hono<AppEnv>();

/** Resolve the pending invite for a raw token, or null. */
async function findInvite(db: AppEnv["Variables"]["db"], token: string) {
  const tokenHash = await sha256Hex(token);
  return db.query.users.findFirst({
    where: and(
      eq(users.inviteTokenHash, tokenHash),
      eq(users.status, "invited"),
    ),
  });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

// Look up an invite so the accept page can show who it's for. Public.
invites.get("/:token", async (c) => {
  const db = c.get("db");
  const token = c.req.param("token");
  const invite = await findInvite(db, token);
  if (!invite) {
    return c.json({ error: "This invite link is invalid or has already been used." }, 404);
  }
  if (isExpired(invite.inviteExpiresAt)) {
    return c.json(
      { error: "This invite has expired. Ask a family member to resend it." },
      410,
    );
  }
  const family = await db.query.families.findFirst({
    where: eq(families.id, invite.familyId),
  });
  return c.json<InvitePreview>({
    name: invite.name,
    email: invite.email,
    familyName: family?.name ?? "your family",
    role: invite.role,
  });
});

// Accept an invite: set a password, activate the account, start a session. Public.
invites.post("/:token/accept", async (c) => {
  const db = c.get("db");
  const token = c.req.param("token");
  const body = await c.req.json().catch(() => ({}));
  const password = requireString(body.password, "Password", { min: 8, max: 200 });

  const invite = await findInvite(db, token);
  if (!invite) {
    return c.json({ error: "This invite link is invalid or has already been used." }, 404);
  }
  if (isExpired(invite.inviteExpiresAt)) {
    return c.json(
      { error: "This invite has expired. Ask a family member to resend it." },
      410,
    );
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      status: "active",
      inviteTokenHash: null,
      inviteExpiresAt: null,
    })
    .where(eq(users.id, invite.id));

  await startSession(c, db, invite.id);

  const family = await db.query.families.findFirst({
    where: eq(families.id, invite.familyId),
  });
  const activated = await db.query.users.findFirst({
    where: eq(users.id, invite.id),
  });
  return c.json<AuthState>({
    member: toMember(activated!),
    family: { id: invite.familyId, name: family?.name ?? "" },
  });
});

export default invites;
