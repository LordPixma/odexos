import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useForgotPassword } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, Input } from "../components/ui";
import AuthShell from "../components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const forgot = useForgotPassword();

  function submit(e: FormEvent) {
    e.preventDefault();
    forgot.mutate({ email });
  }

  if (forgot.isSuccess) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
            ✉️
          </div>
          <h2 className="font-display text-xl font-bold text-white">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            If an account exists for <span className="font-medium text-slate-700">{email}</span>,
            we've sent a link to reset your password. It expires in 60 minutes.
          </p>
          <Link
            to="/"
            className="mt-5 inline-block text-sm font-semibold text-brand-400 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">
          Forgot your password?
        </h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Enter your email and we'll send you a reset link.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            autoComplete="email"
          />
        </Field>

        <ErrorBanner message={(forgot.error as ApiError | null)?.message} />

        <Button type="submit" className="w-full" disabled={forgot.isPending}>
          {forgot.isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm">
        <Link to="/" className="font-semibold text-brand-400 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
