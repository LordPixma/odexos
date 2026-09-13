import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth, useLogout } from "../lib/auth";
import { MemberAvatar } from "./ui";
import UpdateBanner from "./UpdateBanner";
import NotificationsBell from "./NotificationsBell";
import { LogoutIcon } from "./icons";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 via-cyan-400 to-brand-500 font-display text-lg font-bold text-white shadow-[0_6px_18px_-6px_rgba(6,182,212,0.7)]">
        O
      </span>
      <div className="leading-tight">
        <div className="font-display text-base font-bold tracking-tight text-white">
          OdexOS
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300/80">
          Family HQ
        </div>
      </div>
    </Link>
  );
}

export default function AppLayout() {
  const { auth } = useAuth();
  const logout = useLogout();
  const { pathname } = useLocation();
  const onDashboard = pathname === "/";

  return (
    <div className="min-h-full">
      {/* Top chrome (no section menu — sections live as cards on the dashboard) */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0b0f1a]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            {!onDashboard && (
              <Link
                to="/"
                className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.09] hover:text-white sm:flex"
              >
                ← Dashboard
              </Link>
            )}
          </div>
          {auth && (
            <div className="flex items-center gap-2">
              <NotificationsBell compact />
              <Link
                to="/profile"
                title="My profile"
                className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 transition hover:bg-white/[0.08] sm:px-2.5"
              >
                <MemberAvatar member={auth.member} size={26} />
                <div className="hidden leading-tight sm:block">
                  <div className="text-xs font-semibold text-slate-100">
                    {auth.member.nickname || auth.member.name.split(" ")[0]}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => logout.mutate()}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
                aria-label="Sign out"
              >
                <LogoutIcon />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          )}
        </div>
        {!onDashboard && (
          <div className="mx-auto max-w-7xl px-4 pb-2 sm:hidden">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-300"
            >
              ← Dashboard
            </Link>
          </div>
        )}
      </header>

      {/* Main content */}
      <main>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>

      <UpdateBanner />
    </div>
  );
}
