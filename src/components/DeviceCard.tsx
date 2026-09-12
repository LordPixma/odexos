import { useEffect, useState } from "react";
import { Button, Card, SectionHead } from "./ui";
import { BellIcon, PhoneIcon } from "./icons";
import { api, ApiError } from "../lib/api";
import {
  disablePush,
  enablePush,
  isStandalone,
  onInstallAvailable,
  promptInstall,
  pushSubscribed,
  pushSupported,
  type PushConfig,
} from "../lib/pwa";

/** iOS only allows Web Push once the site has been added to the Home Screen. */
function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as a Mac, but a touchscreen gives it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Install the app on this device, and turn notifications on for this browser.
 *
 * Both are per-device, not per-account — which is why they live here and not
 * with the email preferences: signing in on a new phone doesn't carry them
 * over, and the copy needs to say so.
 */
export default function DeviceCard() {
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => onInstallAvailable(setInstallable), []);

  useEffect(() => {
    let live = true;
    api
      .get<PushConfig>("/push/config")
      .then((c) => live && setConfig(c))
      .catch(() => live && setConfig(null));
    pushSubscribed().then((s) => live && setSubscribed(s));
    return () => {
      live = false;
    };
  }, []);

  async function toggle() {
    setError(null);
    setTestSent(false);
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
      } else {
        if (!config?.publicKey) throw new Error("Push isn't configured yet");
        await enablePush(config.publicKey);
        setSubscribed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/push/test");
      setTestSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't send a test notification",
      );
    } finally {
      setBusy(false);
    }
  }

  const canPush = pushSupported();
  const needsInstallFirst = isIos() && !installed;

  return (
    <Card className="p-5">
      <SectionHead
        icon={<PhoneIcon size={18} />}
        tint="#2f74e0"
        title="This device"
        subtitle="Install the app and get alerts on your phone"
      />

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* --- Install --- */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="text-sm font-medium text-slate-100">Install OdexOS</div>
        {installed ? (
          <p className="mt-1 text-xs text-emerald-300">
            Installed — you're running it as an app.
          </p>
        ) : installable ? (
          <>
            <p className="mt-1 text-xs text-slate-400">
              Opens full screen from your home screen, and works offline.
            </p>
            <Button
              type="button"
              className="mt-3"
              onClick={async () => {
                if (await promptInstall()) setInstalled(true);
              }}
            >
              Install
            </Button>
          </>
        ) : isIos() ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            In Safari, tap Share then <strong>Add to Home Screen</strong>.
          </p>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Use your browser's menu → <strong>Install</strong> (or Add to Home
            Screen).
          </p>
        )}
      </div>

      {/* --- Notifications --- */}
      <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
              <BellIcon size={15} />
              Push notifications
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {!canPush
                ? "This browser doesn't support notifications."
                : !config?.enabled
                  ? "Not set up on this server yet."
                  : needsInstallFirst
                    ? "On iPhone, add OdexOS to your Home Screen first — Safari only allows notifications for installed apps."
                    : subscribed
                      ? "On for this device. Budget alerts and birthdays will reach your phone."
                      : "Off. Turn on to get budget alerts and birthdays here."}
            </p>
          </div>
          {canPush && config?.enabled && !needsInstallFirst && (
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              role="switch"
              aria-checked={subscribed}
              aria-label="Push notifications"
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                subscribed ? "bg-brand-500" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  subscribed ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          )}
        </div>

        {subscribed && (
          <div className="mt-3 flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={sendTest}
              disabled={busy}
            >
              Send a test
            </Button>
            {testSent && (
              <span className="text-xs text-emerald-300">Sent — check your device.</span>
            )}
          </div>
        )}

        {(config?.devices.length ?? 0) > 1 && (
          <p className="mt-2 text-xs text-slate-500">
            {config!.devices.length} devices are set up for your account.
          </p>
        )}
      </div>
    </Card>
  );
}
