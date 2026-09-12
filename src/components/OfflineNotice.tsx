import { useEffect, useState } from "react";
import AuthShell from "./AuthShell";
import { Button } from "./ui";

/**
 * Shown when the app loads from the service-worker cache but can't reach the
 * server. The family is still signed in — we just can't prove it yet — so this
 * says "offline", not "signed out", and retries by itself when the connection
 * comes back.
 */
export default function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    function back() {
      setOnline(true);
      onRetry();
    }
    window.addEventListener("online", back);
    window.addEventListener("offline", () => setOnline(false));
    return () => {
      window.removeEventListener("online", back);
    };
  }, [onRetry]);

  return (
    <AuthShell>
      <div className="text-center">
        <div className="mb-3 text-3xl">📡</div>
        <h2 className="font-display text-xl font-bold text-white">
          {online ? "Can't reach OdexOS" : "You're offline"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {online
            ? "The app loaded, but the server didn't answer. It may be a blip."
            : "Your plans and chores are waiting — reconnect and they'll load straight back."}
        </p>
        <Button type="button" className="mt-5 w-full" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </AuthShell>
  );
}
