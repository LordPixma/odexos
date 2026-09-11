import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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
    <div
      className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10"
      style={{
        backgroundColor: "#062b20",
        backgroundImage:
          "radial-gradient(40rem 40rem at 15% 0%, rgba(31,164,113,0.45), transparent 55%), radial-gradient(38rem 38rem at 100% 100%, rgba(233,162,52,0.32), transparent 55%), radial-gradient(30rem 30rem at 90% 0%, rgba(15,138,95,0.4), transparent 60%)",
      }}
    >
      {/* faint grid texture */}
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
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-sand-100 p-1 text-sm font-semibold">
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

            {mode === "login" && (
              <div className="-mt-1 text-right">
                <Link
                  to="/forgot"
                  className="text-sm font-medium text-brand-600 hover:underline"
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
        </div>

        <p className="mt-6 text-center text-xs text-white/60">
          Built on Cloudflare · Everyone in the family, one clear view
        </p>
      </div>
    </div>
  );
}
