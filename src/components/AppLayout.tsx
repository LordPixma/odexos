import { NavLink, Outlet } from "react-router-dom";
import { useAuth, useLogout } from "../lib/auth";
import { Avatar } from "./ui";
import NotificationsBell from "./NotificationsBell";
import {
  CalendarIcon,
  ChartIcon,
  ClipboardIcon,
  HomeIcon,
  LogoutIcon,
  ReceiptIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
} from "./icons";
import type { ComponentType } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: HomeIcon, end: true },
  { to: "/activities", label: "Activities", icon: CalendarIcon },
  { to: "/household", label: "Household", icon: ClipboardIcon },
  { to: "/expenses", label: "Expenses", icon: WalletIcon },
  { to: "/transactions", label: "Transactions", icon: ReceiptIcon },
  { to: "/budgets", label: "Budgets", icon: TargetIcon },
  { to: "/finance", label: "Finance", icon: ChartIcon },
  { to: "/family", label: "Family", icon: UsersIcon },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
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
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex gap-1 lg:flex-col">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-white/[0.06] text-white"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`absolute left-0 top-1/2 hidden h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-300 to-cyan-400 transition-opacity lg:block ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
              />
              <Icon
                size={19}
                className={
                  isActive
                    ? "text-brand-300"
                    : "text-slate-500 group-hover:text-slate-300"
                }
              />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const { auth } = useAuth();
  const logout = useLogout();

  return (
    <div className="min-h-full lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#0b0f1a]/80 p-4 backdrop-blur-xl lg:flex">
        <div className="px-2 py-2">
          <Logo />
        </div>
        <div className="mt-6 flex-1">
          <NavLinks />
        </div>
        {auth && (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="flex items-center gap-3 px-2">
              <Avatar name={auth.member.name} color={auth.member.color} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold text-slate-100">
                  {auth.member.name}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {auth.family.name}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <NotificationsBell />
            </div>
            <button
              onClick={() => logout.mutate()}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
            >
              <LogoutIcon /> Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0b0f1a]/85 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          {auth && (
            <div className="flex items-center gap-1">
              <NotificationsBell compact />
              <button
                onClick={() => logout.mutate()}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-400 hover:bg-white/[0.04]"
              >
                <LogoutIcon /> Sign out
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto px-2 pb-2">
          <NavLinks />
        </div>
      </header>

      {/* Main content */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
