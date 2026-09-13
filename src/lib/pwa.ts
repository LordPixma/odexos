/**
 * Progressive-web-app plumbing: registering the service worker, the install
 * prompt, and turning Web Push on or off for this browser.
 */

import { api } from "./api";

/** Chrome fires this so the page can offer install at a sensible moment. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(available: boolean) => void>();

function announce(available: boolean) {
  for (const fn of installListeners) fn(available);
}

/** Subscribe to "can this be installed right now?". Returns an unsubscribe. */
export function onInstallAvailable(fn: (available: boolean) => void): () => void {
  installListeners.add(fn);
  fn(deferredPrompt !== null);
  return () => installListeners.delete(fn);
}

/** Shows the browser's install dialog. Resolves true if they installed it. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  // A prompt can only be used once.
  deferredPrompt = null;
  announce(false);
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

/** True when already running as an installed app. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari predates the standard and uses its own flag.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

const updateListeners = new Set<(ready: boolean) => void>();
let updateReady = false;

/**
 * Fires when a new build is installed and waiting. Reloading is what actually
 * swaps it in, so the app can offer that rather than leaving someone on old
 * code until they happen to close the tab.
 */
export function onUpdateReady(fn: (ready: boolean) => void): () => void {
  updateListeners.add(fn);
  fn(updateReady);
  return () => updateListeners.delete(fn);
}

function announceUpdate() {
  updateReady = true;
  for (const fn of updateListeners) fn(true);
}

/** How often a long-open app checks for a new build. */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep the event so the app can offer install in its own UI instead of
    // whatever moment the browser picked.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    announce(true);
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    announce(false);
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // A worker arriving while one already controls the page is an update,
        // not a first install — that's the case worth telling someone about.
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing || !navigator.serviceWorker.controller) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") announceUpdate();
          });
        });

        // An installed app can stay open for days, so look for a new build
        // periodically and whenever it comes back to the foreground.
        const check = () => {
          if (document.visibilityState === "visible") void reg.update();
        };
        setInterval(check, UPDATE_CHECK_MS);
        document.addEventListener("visibilitychange", check);
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
  });
}

// --- Web Push ---

export interface PushConfig {
  publicKey: string | null;
  enabled: boolean;
  devices: { id: string; userAgent: string | null; createdAt: string }[];
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = (s + "=".repeat((4 - (s.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Does this browser support Web Push at all? (iOS needs the installed app.) */
export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Is this browser currently subscribed? */
export async function pushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/**
 * Asks permission, subscribes with the server's VAPID key, and registers the
 * subscription. Throws with a readable message when the user says no.
 */
export async function enablePush(publicKey: string): Promise<void> {
  if (!pushSupported()) throw new Error("This browser can't do notifications");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site — allow them in your browser settings."
        : "Notifications weren't allowed",
    );
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  // A stale subscription from a previous VAPID key can't be reused.
  if (existing) await existing.unsubscribe();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64urlToBytes(publicKey) as BufferSource,
  });

  await api.post("/push/subscribe", {
    endpoint: sub.endpoint,
    keys: {
      p256dh: bytesToB64url(sub.getKey("p256dh")),
      auth: bytesToB64url(sub.getKey("auth")),
    },
    userAgent: navigator.userAgent.slice(0, 200),
  });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
