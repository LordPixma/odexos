/**
 * Web Push from a Cloudflare Worker, with no dependencies.
 *
 * Two specs meet here:
 *  - RFC 8292 (VAPID): a signed ES256 JWT proves to the push service which
 *    application server is asking, so anyone who steals a subscription URL
 *    still can't send to it.
 *  - RFC 8291 (aes128gcm): the payload is encrypted to a key pair the browser
 *    generated, so the push service relays bytes it cannot read.
 *
 * Everything below uses Web Crypto, which Workers implement natively.
 */

import { and, eq } from "drizzle-orm";
import { pushSubscriptions, users } from "../db/schema";
import type { Db } from "../db/client";
import type { Bindings } from "./types";

export interface PushSubscriptionRecord {
  endpoint: string;
  /** Browser's ECDH public key, base64url, uncompressed P-256 point. */
  p256dh: string;
  /** Browser's auth secret, base64url, 16 bytes. */
  auth: string;
}

export interface PushMessage {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** Why a send failed, so callers can prune subscriptions that are gone. */
export type PushResult =
  | { ok: true }
  | { ok: false; gone: boolean; status: number; error: string };

// --- base64url helpers ---

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

// --- VAPID ---

/**
 * Generates a VAPID key pair. Run once; the private key goes in a secret and
 * the public key is handed to the browser when it subscribes.
 */
export async function generateVapidKeys(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  const priv = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  return {
    publicKey: bytesToB64url(new Uint8Array(pub)),
    privateKey: bytesToB64url(new Uint8Array(priv)),
  };
}

async function importVapidPrivateKey(pkcs8B64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    b64urlToBytes(pkcs8B64url) as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** ES256 JWT for the push service's origin (RFC 8292 §2). */
async function vapidAuthHeader(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string,
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    utf8(
      JSON.stringify({
        aud,
        // 12 hours; the spec caps it at 24.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const key = await importVapidPrivateKey(privateKey);
  // WebCrypto returns the raw r||s form JWS wants, not DER.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    utf8(signingInput),
  );
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${publicKey}`;
}

// --- Payload encryption (RFC 8291, aes128gcm) ---

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypts `plaintext` to a subscription, producing a complete aes128gcm body:
 * a 86-byte header (salt, record size, sender public key) followed by one
 * encrypted record.
 */
async function encryptPayload(
  sub: PushSubscriptionRecord,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const clientPublic = b64urlToBytes(sub.p256dh);
  const authSecret = b64urlToBytes(sub.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Ephemeral sender key pair — a fresh one per message.
  const sender = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const senderPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", sender.publicKey)) as ArrayBuffer,
  );

  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      // Web Crypto names this member "public"; Cloudflare's generated types
      // spell it "$public" because `public` is a reserved word, so the cast
      // keeps the wire-correct name.
      { name: "ECDH", public: clientKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      sender.privateKey,
      256,
    ),
  );

  // PRK: mixes in both public keys so the derivation is bound to this pair.
  const keyInfo = concat(
    utf8("WebPush: info\0"),
    clientPublic,
    senderPublic,
  );
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const contentKey = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // A single record, delimited by 0x02 (the last-record padding byte).
  const record = concat(plaintext, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aesKey,
      record as BufferSource,
    ),
  );

  // Header: salt(16) | record size(4, big endian) | key length(1) | key(65)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  const header = concat(
    salt,
    recordSize,
    new Uint8Array([senderPublic.length]),
    senderPublic,
  );
  return concat(header, ciphertext);
}

// --- Sending ---

/**
 * Delivers one notification. Returns `gone: true` when the push service says
 * the subscription no longer exists, so the caller can delete it.
 */
export async function sendPush(
  env: Bindings,
  sub: PushSubscriptionRecord,
  message: PushMessage,
): Promise<PushResult> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return { ok: false, gone: false, status: 0, error: "Push is not configured" };
  }

  const body = await encryptPayload(sub, utf8(JSON.stringify(message)));
  const auth = await vapidAuthHeader(
    sub.endpoint,
    env.VAPID_SUBJECT || "mailto:hello@odexos.app",
    publicKey,
    privateKey,
  );

  let res: Response;
  try {
    res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "normal",
      },
      body: body as BodyInit,
    });
  } catch (err) {
    // The push service was unreachable. Not the subscription's fault, so it
    // stays registered and the next send can try again.
    return {
      ok: false,
      gone: false,
      status: 0,
      error: err instanceof Error ? err.message : "Push request failed",
    };
  }

  if (res.ok) return { ok: true };
  // 404/410 mean the subscription is dead — the browser was uninstalled, or
  // permission was revoked.
  return {
    ok: false,
    gone: res.status === 404 || res.status === 410,
    status: res.status,
    error: (await res.text().catch(() => "")) || res.statusText,
  };
}

/**
 * Sends to one person's devices, whatever their family-wide preferences say —
 * used for things addressed to them personally, like a merit. Prunes dead
 * subscriptions. Returns how many landed and why any failed, so a "nothing
 * arrived" can be diagnosed instead of guessed at.
 */
export async function pushToUser(
  db: Db,
  env: Bindings,
  userId: string,
  message: PushMessage,
): Promise<{ sent: number; removed: number; errors: string[] }> {
  const out = { sent: 0, removed: 0, errors: [] as string[] };
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    out.errors.push("Push is not configured on the server");
    return out;
  }

  try {
    const subs = await db.query.pushSubscriptions.findMany({
      where: eq(pushSubscriptions.userId, userId),
    });
    for (const sub of subs) {
      const result = await sendPush(env, sub, message);
      if (result.ok) {
        out.sent++;
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date().toISOString() })
          .where(eq(pushSubscriptions.id, sub.id));
      } else if (result.gone) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
        out.removed++;
      } else {
        out.errors.push(`${result.status}: ${result.error.slice(0, 160)}`);
      }
    }
  } catch (err) {
    out.errors.push(err instanceof Error ? err.message : "Push failed");
  }
  return out;
}

// --- Fan-out to a family ---

/**
 * Sends to every registered device belonging to members who still want this
 * kind of notification, and prunes subscriptions the push service says are
 * gone. Never throws: a notification failing must not fail the thing that
 * triggered it.
 */
export async function pushToFamily(
  db: Db,
  env: Bindings,
  familyId: string,
  message: PushMessage,
  pref: "budget" | "digest",
): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;

  try {
    const wanted =
      pref === "budget" ? users.notifyBudgetAlerts : users.notifyWeeklyDigest;
    const members = await db.query.users.findMany({
      where: and(
        eq(users.familyId, familyId),
        eq(users.status, "active"),
        eq(wanted, true),
      ),
      columns: { id: true },
    });
    if (members.length === 0) return 0;

    const allowed = new Set(members.map((m) => m.id));
    const subs = await db.query.pushSubscriptions.findMany({
      where: eq(pushSubscriptions.familyId, familyId),
    });

    let sent = 0;
    for (const sub of subs) {
      if (!allowed.has(sub.userId)) continue;
      const result = await sendPush(env, sub, message);
      if (result.ok) {
        sent++;
        // Stamped so this table records real deliveries, not just taps of the
        // test button. Without it a cron push that never arrives looks exactly
        // like one that was never sent.
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date().toISOString() })
          .where(eq(pushSubscriptions.id, sub.id));
      } else if (result.gone) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
      } else {
        // A push service that refuses is worth saying out loud; this runs on a
        // cron with nobody watching the response.
        console.error(
          `Push to ${sub.userId} failed (${result.status}): ${result.error.slice(0, 200)}`,
        );
      }
    }
    return sent;
  } catch (err) {
    console.error("Push fan-out failed:", err);
    return 0;
  }
}

