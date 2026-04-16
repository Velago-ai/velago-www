import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register, confirmEmail, login } from "@/lib/api-auth";
import { setTokens, isAuthenticated } from "@/lib/auth";
import velagoLogo from "@assets/velago_logo_nobg.svg";

const LOGO_FILTER =
  "brightness(0) saturate(100%) invert(18%) sepia(90%) saturate(2500%) hue-rotate(220deg) brightness(95%) contrast(95%)";

type Mode = "login" | "register" | "confirm";

export default function Auth() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) setLocation("/voice");
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await login(email, password);
      setTokens(tokens.access_token, tokens.refresh_token);
      setLocation("/voice");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, password);
      switchMode("confirm");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmEmail(email, code);
      const tokens = await login(email, password);
      setTokens(tokens.access_token, tokens.refresh_token);
      setLocation("/voice");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img
            src={velagoLogo}
            alt="VelaGo"
            className="h-16 object-contain"
            style={{ filter: LOGO_FILTER }}
          />
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-border">
          {mode === "login" && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-1">Welcome back</h1>
              <p className="text-muted-foreground text-sm mb-6">Sign in to continue with VelaGo</p>
              <form onSubmit={handleLogin} className="flex flex-col gap-3">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 mt-1 rounded-full bg-primary-gradient text-white border-0"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-6">
                No account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="text-primary font-medium hover:underline"
                >
                  Create one
                </button>
              </p>
            </>
          )}

          {mode === "register" && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-1">Create account</h1>
              <p className="text-muted-foreground text-sm mb-6">Get started with VelaGo</p>
              <form onSubmit={handleRegister} className="flex flex-col gap-3">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Input
                  type="password"
                  placeholder="Password (min 8 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 mt-1 rounded-full bg-primary-gradient text-white border-0"
                >
                  {loading ? "Creating account…" : "Create account"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-6">
                Have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-primary font-medium hover:underline"
                >
                  Sign in
                </button>
              </p>
            </>
          )}

          {mode === "confirm" && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-1">Check your email</h1>
              <p className="text-muted-foreground text-sm mb-6">
                We sent a code to{" "}
                <span className="text-foreground font-medium">{email}</span>
              </p>
              <form onSubmit={handleConfirm} className="flex flex-col gap-3">
                <Input
                  type="text"
                  placeholder="Verification code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 mt-1 rounded-full bg-primary-gradient text-white border-0"
                >
                  {loading ? "Verifying…" : "Verify & sign in"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-6">
                Wrong email?{" "}
                <button
                  type="button"
                  onClick={() => { switchMode("register"); setCode(""); }}
                  className="text-primary font-medium hover:underline"
                >
                  Go back
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
