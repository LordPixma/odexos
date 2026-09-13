import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  enablePush,
  isStandalone,
  pushSubscribed,
  pushSupported,
  type PushConfig,
} from "../lib/pwa";

const DISMISS_KEY = "odexos.push-prompt-dismissed";

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Notifications are opt-in per device, and the switch lives on the profile
 * page — which is not where anyone looks. This offers it once, where people
 * actually are, and stays out of the way after.
 */
export default function EnableNotifications() {
  const [show, setShow] = useState(false);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!pushSupported()) return;
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        // Private browsing — just show it.
      }
      if (await pushSubscribed()) return;
      try {
        const cfg = await api.get<PushConfig>("/push/config");
        if (!live || !cfg.enabled) return;
        setConfig(cfg);
        setShow(true);
      } catch {
        // Not signed in yet, or the server has push switched off.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to do — it just asks again next time.
    }
    setShow(false);
  }

  if (!show) return null;

  // On iPhone, Safari only allows notifications once the app is on the Home
  // Screen, so asking here would fail — point at the real first step instead.
  const needsInstall = isIos() && !isStandalone();

  return (
    <div className="rounded-2xl border border-accent-500/25 bg-accent-500/[0.07] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/20 text-lg">
          🔔
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">
            {needsInstall ? "Add OdexOS to your Home Screen" : "Turn on notifications"}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            {error ??
              (needsInstall
                ? "In Safari, tap Share then Add to Home Screen — then notifications can be switched on."
                : "Merits, budget alerts and birthdays, straight to this device.")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {needsInstall ? (
            <Link
              to="/profile"
              className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10"
            >
              How
            </Link>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setError(null);
                setBusy(true);
                try {
                  await enablePush(config!.publicKey!);
                  setShow(false);
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Couldn't turn them on",
                  );
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-ink transition hover:bg-brand-400 disabled:opacity-60"
            >
              {busy ? "Asking…" : "Turn on"}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
