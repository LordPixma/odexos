import { useEffect, useState } from "react";
import { onUpdateReady } from "../lib/pwa";

/**
 * A new build only takes effect on the next navigation, and an installed app
 * can sit open for days. Rather than leaving someone on old code wondering why
 * a feature isn't there, say so and offer the reload.
 */
export default function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => onUpdateReady(setReady), []);

  if (!ready) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md sm:inset-x-auto sm:right-4">
      <div className="flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-surface/95 p-3 shadow-glass backdrop-blur-xl">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-lg">
          ✨
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">
            A new version is ready
          </div>
          <div className="text-xs text-slate-400">Reload to pick it up.</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setReloading(true);
            window.location.reload();
          }}
          disabled={reloading}
          className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-ink transition hover:bg-brand-400 disabled:opacity-60"
        >
          {reloading ? "Reloading…" : "Reload"}
        </button>
      </div>
    </div>
  );
}
