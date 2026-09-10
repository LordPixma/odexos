import { useState, type FormEvent } from "react";
import { useLogin, useRegister } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, Input } from "../components/ui";

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
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl font-extrabold backdrop-blur">
            O
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">OdexOS</h1>
          <p className="mt-1 text-sm text-white/70">
            Your family's operations command center
          </p>
        </div>

        <div className="card p-6 sm:p-8">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
            <button
              className={`rounded-md py-2 transition ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
              onClick={() => setMode("login")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`rounded-md py-2 transition ${
                mode === "register"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
              onClick={() => setMode("register")}
              type="button"
            >
              Create a family
            </button>
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

            <ErrorBanner message={error} />

            <Button type="submit" className="w-full" disabled={pending}>
              {pending
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create family & continue"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/60">
          Built on Cloudflare · Everyone in the family, one clear view
        </p>
      </div>
    </div>
  );
}
