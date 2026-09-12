import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useLogin, useRegister } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, Input } from "../components/ui";
import AuthShell from "../components/AuthShell";

type Mode = "login" | "register";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const login = useLogin();
  const register = useRegister();

  const [familyName, setFamilyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const pending = login.isPending || register.isPending;
  const error =
    (login.error as ApiError | null)?.message ??
    (register.error as ApiError | null)?.message;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "login") {
      login.mutate({ email, password });
    } else {
      register.mutate({ familyName, name, email, password });
    }
  }

  return (
    <AuthShell footer="Built on Cloudflare · Everyone in the family, one clear view">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 text-sm font-semibold ring-1 ring-white/10">
        {(
          [
            ["login", "Sign in"],
            ["register", "Create a family"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`rounded-lg py-2 transition ${
              mode === value
                ? "bg-brand-500 text-ink shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setMode(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <>
                <Field label="Family name">
                  <Input
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder="The Odekunle Family"
                    required
                    autoComplete="off"
                  />
                </Field>
                <Field label="Your name">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Samuel"
                    required
                    autoComplete="name"
                  />
                </Field>
              </>
            )}
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </Field>
            <Field
              label="Password"
              hint={mode === "register" ? "At least 8 characters" : undefined}
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={mode === "register" ? 8 : undefined}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
              />
            </Field>

            {mode === "login" && (
              <div className="-mt-1 text-right">
                <Link
                  to="/forgot"
                  className="text-sm font-medium text-brand-400 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <ErrorBanner message={error} />

            <Button type="submit" className="w-full" disabled={pending}>
              {pending
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create family & continue"}
            </Button>
      </form>
    </AuthShell>
  );
}
