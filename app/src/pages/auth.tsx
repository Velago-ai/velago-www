import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register, confirmEmail, login, requestResetCode, confirmReset } from "@/lib/api-auth";
import { isAuthenticated, setTokens } from "@/lib/auth";
import velagoLogo from "@assets/velago_logo_nobg.svg";

const LOGO_FILTER =
  "brightness(0) saturate(100%) invert(18%) sepia(90%) saturate(2500%) hue-rotate(220deg) brightness(95%) contrast(95%)";

// Min 8 chars, at least 1 letter, at least 1 digit, no spaces/quotes/commas
const PASSWORD_RE = /^(?=.*[a-zA-Z])(?=.*\d)[^\s'",]{8,}$/;

type Mode = "login" | "register" | "confirm" | "reset-email" | "reset-code";

export default function Auth() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) { setLocation("/voice"); return; }
    const params = new URLSearchParams(window.location.search);
    const resetEmail = params.get("reset");
    if (resetEmail) {
      setEmail(resetEmail);
      setMode("reset-code");
    }
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setSuccess(null);
  }

  function validatePassword(): string | null {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(password)) return "Password must contain at least one letter.";
    if (!/\d/.test(password)) return "Password must contain at least one number.";
    if (!PASSWORD_RE.test(password)) return "Password must not contain spaces, quotes, or commas.";
    return null;
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

    const pwdError = validatePassword();
    if (pwdError) { setError(pwdError); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

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
      setCode("");
      setPassword("");
      setConfirmPassword("");
      switchMode("login");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) { setError("Please enter your email."); return; }
    setLoading(true);
    try {
      await requestResetCode(email);
      setCode("");
      setNewPassword("");
      switchMode("reset-code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pwdErr = validateNewPassword();
    if (pwdErr) { setError(pwdErr); return; }
    setLoading(true);
    try {
      await confirmReset(email, code, newPassword);
      setCode("");
      setNewPassword("");
      setPassword("");
      setSuccess("Password updated. Sign in with your new password.");
      switchMode("login");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function validateNewPassword(): string | null {
    if (newPassword.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(newPassword)) return "Password must contain at least one letter.";
    if (!/\d/.test(newPassword)) return "Password must contain at least one number.";
    if (!PASSWORD_RE.test(newPassword)) return "Password must not contain spaces, quotes, or commas.";
    return null;
  }

  async function handleResendCode() {
    setError(null);
    setLoading(true);
    try {
      await requestResetCode(email);
      setSuccess("Code resent. Check your email.");
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
                {success && <p className="text-sm text-emerald-600">{success}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 mt-1 rounded-full bg-primary-gradient text-white border-0"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                <button
                  type="button"
                  onClick={() => switchMode("reset-email")}
                  className="text-primary font-medium hover:underline"
                >
                  Forgot password?
                </button>
              </p>
              <p className="text-center text-sm text-muted-foreground mt-2">
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
                <div>
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground mt-1 px-1">
                    Min 8 characters, at least one letter and one number. No spaces, quotes, or commas.
                  </p>
                </div>
                <Input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
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

          {mode === "reset-email" && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-1">Reset password</h1>
              <p className="text-muted-foreground text-sm mb-6">
                Enter your email and we'll send you a verification code
              </p>
              <form onSubmit={handleResetRequest} className="flex flex-col gap-3">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 mt-1 rounded-full bg-primary-gradient text-white border-0"
                >
                  {loading ? "Sending…" : "Send code"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-6">
                Remember your password?{" "}
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

          {mode === "reset-code" && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-1">Enter code</h1>
              <p className="text-muted-foreground text-sm mb-6">
                We sent a verification code to{" "}
                <span className="text-foreground font-medium">{email}</span>
              </p>
              <form onSubmit={handleResetConfirm} className="flex flex-col gap-3">
                <Input
                  type="text"
                  placeholder="Verification code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
                <div>
                  <Input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground mt-1 px-1">
                    Min 8 characters, at least one letter and one number.
                  </p>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {success && <p className="text-sm text-emerald-600">{success}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 mt-1 rounded-full bg-primary-gradient text-white border-0"
                >
                  {loading ? "Updating…" : "Set new password"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="text-primary font-medium hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </p>
              <p className="text-center text-sm text-muted-foreground mt-2">
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-primary font-medium hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}

          {mode === "confirm" && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-1">Check your email</h1>
              <p className="text-muted-foreground text-sm mb-6">
                We sent a verification code to{" "}
                <span className="text-foreground font-medium">{email}</span>
              </p>
              <form onSubmit={handleConfirm} className="flex flex-col gap-3">
                <Input
                  type="text"
                  placeholder="Authorization code"
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
                  {loading ? "Verifying…" : "Confirm email"}
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
