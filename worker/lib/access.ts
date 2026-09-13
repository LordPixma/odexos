/**
 * Who can see what.
 *
 * Children get a smaller app: chores, merits, their own allowance, the
 * calendar and the household lists. The family's money — accounts, bank
 * connections, transactions, budgets and expenses — is not theirs to see, and
 * that has to hold at the API, not just in which cards the dashboard renders.
 */

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./types";

/** True for a member who should not see the family's finances. */
export function isChild(role: string): boolean {
  return role === "child";
}

/** Blocks children from a whole route group. */
export const adultsOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (isChild(c.get("user").role)) {
    return c.json({ error: "That's not part of your OdexOS" }, 403);
  }
  return next();
};
