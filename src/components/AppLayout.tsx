import { NavLink, Outlet } from "react-router-dom";
import { useAuth, useLogout } from "../lib/auth";
import { Avatar } from "./ui";
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
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg font-extrabold text-white">
        O
      </span>
      <div className="leading-tight">
        <div className="text-base font-extrabold tracking-tight text-slate-900">
          OdexOS
        </div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
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
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
        >
          <Icon size={19} />
          <span>{label}</span>
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
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
        <div className="px-2 py-2">
          <Logo />
        </div>
        <div className="mt-6 flex-1">
          <NavLinks />
        </div>
        {auth && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3 px-2">
              <Avatar name={auth.member.name} color={auth.member.color} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {auth.member.name}
                </div>
                <div className="truncate text-xs text-slate-400">
                  {auth.family.name}
                </div>
              </div>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <LogoutIcon /> Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          {auth && (
            <button
              onClick={() => logout.mutate()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              <LogoutIcon /> Sign out
            </button>
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
