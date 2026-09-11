import { useState } from "react";
import {
  useCheckAlerts,
  useFamilySettings,
  useMarkNotificationsRead,
  useNotifications,
  useSendDigest,
  useUpdateFamilySettings,
} from "../lib/queries";
import { Modal } from "./ui";
import { BellIcon } from "./icons";
import { formatDateTime } from "../lib/format";

export default function NotificationsBell({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const check = useCheckAlerts();
  const { data: settings } = useFamilySettings();
  const updateSettings = useUpdateFamilySettings();
  const sendDigest = useSendDigest();

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${
          compact ? "" : "w-full"
        }`}
        aria-label="Notifications"
      >
        <span className="relative">
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        {!compact && <span>Alerts</span>}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Notifications">
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <button
              onClick={() => check.mutate()}
              disabled={check.isPending}
              className="font-medium text-brand-600 hover:underline disabled:opacity-50"
            >
              Check budgets now
            </button>
            {unread > 0 && (
              <button
                onClick={() => markRead.mutate()}
                className="font-medium text-slate-500 hover:text-slate-800"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              You're all caught up.
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {notifications.map((n) => {
                const color = n.type === "budget_over" ? "#dc2626" : "#b45309";
                const unreadItem = n.readAt === null;
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 rounded-lg border px-3 py-2.5 ${
                      unreadItem
                        ? "border-slate-200 bg-white"
                        : "border-slate-100 bg-slate-50/50"
                    }`}
                  >
                    <span className="mt-0.5 text-lg" style={{ color }}>
                      ⚠
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {n.title}
                        </span>
                        {unreadItem && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                        )}
                      </div>
                      <div className="text-sm text-slate-500">{n.body}</div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {formatDateTime(n.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={settings?.alertEmails ?? true}
                onChange={(e) =>
                  updateSettings.mutate({ alertEmails: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Email the family when a budget is breached
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={settings?.weeklyDigest ?? true}
                onChange={(e) =>
                  updateSettings.mutate({ weeklyDigest: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Send a weekly family digest (Monday mornings)
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => sendDigest.mutate()}
                disabled={sendDigest.isPending}
                className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-50"
              >
                Send this week's digest now
              </button>
              {sendDigest.isSuccess && (
                <span className="text-xs text-emerald-600">
                  Sent to {sendDigest.data.sent} member
                  {sendDigest.data.sent === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
