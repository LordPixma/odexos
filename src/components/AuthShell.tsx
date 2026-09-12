import type { ReactNode } from "react";

const MESH_STYLE = {
  backgroundColor: "#062b20",
  backgroundImage:
    "radial-gradient(40rem 40rem at 15% 0%, rgba(31,164,113,0.45), transparent 55%), radial-gradient(38rem 38rem at 100% 100%, rgba(233,162,52,0.32), transparent 55%), radial-gradient(30rem 30rem at 90% 0%, rgba(15,138,95,0.4), transparent 60%)",
} as const;

/** The dark jade mesh + glass-card frame shared by the sign-in, accept-invite
 * and password-reset screens. */
export default function AuthShell({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10"
      style={MESH_STYLE}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 font-display text-3xl font-bold shadow-lg backdrop-blur-md">
            O
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">OdexOS</h1>
          <p className="mt-1.5 text-sm text-white/70">
            Your family's operations command center
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-surface/85 p-6 shadow-glass backdrop-blur-xl sm:p-8">
          {children}
        </div>
        {footer && (
          <p className="mt-6 text-center text-xs text-white/60">{footer}</p>
        )}
      </div>
    </div>
  );
}
