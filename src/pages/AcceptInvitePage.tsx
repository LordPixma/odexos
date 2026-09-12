import { useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useInvitePreview } from "../lib/queries";
import { useAcceptInvite } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, Input, Spinner } from "../components/ui";
import AuthShell from "../components/AuthShell";

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
      <AuthShell>
        <div className="flex justify-center py-6">
          <Spinner className="h-8 w-8" />
        </div>
      </AuthShell>
    );
  }

  if (preview.isError || !preview.data) {
    const message =
      (preview.error as ApiError | null)?.message ??
      "This invite link is invalid or has already been used.";
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">
            ⚠️
          </div>
          <h2 className="font-display text-xl font-bold text-white">
            Invite unavailable
          </h2>
          <p className="mt-2 text-sm text-slate-400">{message}</p>
          <Link
            to="/"
            className="mt-5 inline-block text-sm font-semibold text-brand-400 hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  const invite = preview.data;
  const serverError = (accept.error as ApiError | null)?.message;

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">
          Join {invite.familyName}
        </h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Hi {invite.name.split(" ")[0]} — set a password to activate your account.
        </p>
      </div>

      <div className="mb-5 rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Signing in as</span>
          <span className="font-medium text-slate-200">{invite.email}</span>
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
    </AuthShell>
  );
}
