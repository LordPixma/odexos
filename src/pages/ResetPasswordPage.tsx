import { useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useResetToken, useResetPassword } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, Input, Spinner } from "../components/ui";
import AuthShell from "../components/AuthShell";

export default function ResetPasswordPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const preview = useResetToken(token);
  const reset = useResetPassword();

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
    reset.mutate(
      { token, password },
      { onSuccess: () => navigate("/", { replace: true }) },
    );
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
      "This reset link is invalid or has already been used.";
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">
            ⚠️
          </div>
          <h2 className="font-display text-xl font-bold text-white">
            Reset link unavailable
          </h2>
          <p className="mt-2 text-sm text-slate-400">{message}</p>
          <Link
            to="/forgot"
            className="mt-5 inline-block text-sm font-semibold text-brand-400 hover:underline"
          >
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  const serverError = (reset.error as ApiError | null)?.message;

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">
          Set a new password
        </h2>
        <p className="mt-1.5 text-sm text-slate-400">
          for {preview.data.email}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="At least 8 characters">
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

        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {reset.isPending ? "Saving…" : "Set password & sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
