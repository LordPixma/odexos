import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { initials } from "../lib/format";
import { memberAvatarUrl, type Member } from "@shared/types";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-brand-400 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

type Variant = "primary" | "secondary" | "danger";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const cls =
    variant === "primary"
      ? "btn-primary"
      : variant === "danger"
        ? "btn-danger"
        : "btn-secondary";
  return (
    <button className={`${cls} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A small tinted rounded icon square used in page/section headers. */
function tintStyle(tint: string) {
  return { backgroundColor: `${tint}1a`, color: tint };
}

/** Page-level header: tinted icon chip + display title + subtitle + action. */
export function PageHeader({
  icon,
  tint = "#0f8a5f",
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  tint?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={tintStyle(tint)}
          >
            {icon}
          </span>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Card section header with a tinted icon chip. */
export function SectionHead({
  icon,
  tint = "#0f8a5f",
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  tint?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={tintStyle(tint)}
        >
          {icon}
        </span>
        <div>
          <h2 className="font-display text-base font-semibold leading-tight text-white">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Compact stat tile: uppercase label + big display value + hint. */
export function StatTile({
  label,
  value,
  hint,
  tint = "#0f8a5f",
}: {
  label: string;
  value: string;
  hint?: string;
  tint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-bold" style={{ color: tint }}>
          {value}
        </span>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
    </Card>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// A caller's className extends the base style rather than replacing it —
// spreading props over a fixed className silently drops all of it.
export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input min-h-[80px] ${className}`} {...props} />;
}

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${className}`} {...props} />;
}

export function Avatar({
  name,
  color,
  size = 36,
  src,
}: {
  name: string;
  color: string;
  size?: number;
  /** Profile photo URL; falls back to coloured initials when absent. */
  src?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        title={name}
        className="inline-block shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
      title={name}
    >
      {initials(name) || "?"}
    </span>
  );
}

/** Avatar for a family member — shows their photo when they've uploaded one. */
export function MemberAvatar({
  member,
  size = 36,
}: {
  member: Pick<Member, "id" | "name" | "color" | "avatarVersion">;
  size?: number;
}) {
  return (
    <Avatar
      name={member.name}
      color={member.color}
      size={size}
      src={memberAvatarUrl(member)}
    />
  );
}

export function Badge({
  children,
  color = "#6366f1",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="chip"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center">
      {icon && <div className="mb-3 text-3xl">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="card relative z-10 my-8 w-full max-w-lg bg-surface p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
