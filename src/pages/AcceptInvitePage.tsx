import { useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useInvitePreview } from "../lib/queries";
import { useAcceptInvite } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, Input, Spinner } from "../components/ui";

const MESH_STYLE = {
  backgroundColor: "#062b20",
  backgroundImage:
    "radial-gradient(40rem 40rem at 15% 0%, rgba(31,164,113,0.45), transparent 55%), radial-gradient(38rem 38rem at 100% 100%, rgba(233,162,52,0.32), transparent 55%), radial-gradient(30rem 30rem at 90% 0%, rgba(15,138,95,0.4), transparent 60%)",
} as const;

function Shell({ children }: { children: React.ReactNode }) {
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
        <div className="rounded-3xl border border-white/15 bg-white/95 p-6 shadow-lift backdrop-blur-xl sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError(undefined);
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords don't match.");
      return;
    }
    accept.mutate({ password }, { onSuccess: () => navigate("/", { replace: true }) });
  }

  if (preview.isLoading) {
    return (
      <Shell>
        <div className="flex justify-center py-6">
          <Spinner className="h-8 w-8" />
        </div>
      </Shell>
    );
  }

  if (preview.isError || !preview.data) {
    const message =
      (preview.error as ApiError | null)?.message ??
      "This invite link is invalid or has already been used.";
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">
            ⚠️
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Invite unavailable
          </h2>
          <p className="mt-2 text-sm text-slate-500">{message}</p>
          <Link
            to="/"
            className="mt-5 inline-block text-sm font-semibold text-brand-600 hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  const invite = preview.data;
  const serverError = (accept.error as ApiError | null)?.message;

  return (
    <Shell>
      <div className="mb-6 text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Join {invite.familyName}
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Hi {invite.name.split(" ")[0]} — set a password to activate your account.
        </p>
      </div>

      <div className="mb-5 rounded-xl bg-sand-100 px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Signing in as</span>
          <span className="font-medium text-slate-800">{invite.email}</span>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Create a password" hint="At least 8 characters">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
        <Field label="Confirm password">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
          />
        </Field>

        <ErrorBanner message={localError ?? serverError} />

        <Button type="submit" className="w-full" disabled={accept.isPending}>
          {accept.isPending ? "Setting up…" : `Join ${invite.familyName}`}
        </Button>
      </form>
    </Shell>
  );
}
