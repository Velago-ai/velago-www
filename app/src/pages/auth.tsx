import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register, confirmEmail, login } from "@/lib/api-auth";
import { setTokens, isAuthenticated } from "@/lib/auth";
import velagoLogo from "@assets/velago_logo_nobg.svg";

const LOGO_FILTER =
  "brightness(0) saturate(100%) invert(18%) sepia(90%) saturate(2500%) hue-rotate(220deg) brightness(95%) contrast(95%)";

// Min 8 chars, at least 1 letter, at least 1 digit, no spaces/quotes/commas
const PASSWORD_RE = /^(?=.*[a-zA-Z])(?=.*\d)[^\s'",]{8,}$/;

const SELECT_CLS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const COUNTRY_CODES = [
  { code: "+1",   label: "+1 (US/CA)" },
  { code: "+44",  label: "+44 (UK)" },
  { code: "+49",  label: "+49 (DE)" },
  { code: "+33",  label: "+33 (FR)" },
  { code: "+39",  label: "+39 (IT)" },
  { code: "+34",  label: "+34 (ES)" },
  { code: "+31",  label: "+31 (NL)" },
  { code: "+7",   label: "+7 (RU)" },
  { code: "+380", label: "+380 (UA)" },
  { code: "+48",  label: "+48 (PL)" },
  { code: "+41",  label: "+41 (CH)" },
  { code: "+43",  label: "+43 (AT)" },
  { code: "+32",  label: "+32 (BE)" },
  { code: "+61",  label: "+61 (AU)" },
  { code: "+64",  label: "+64 (NZ)" },
  { code: "+81",  label: "+81 (JP)" },
  { code: "+82",  label: "+82 (KR)" },
  { code: "+86",  label: "+86 (CN)" },
  { code: "+91",  label: "+91 (IN)" },
  { code: "+55",  label: "+55 (BR)" },
  { code: "+52",  label: "+52 (MX)" },
  { code: "+971", label: "+971 (AE)" },
  { code: "+972", label: "+972 (IL)" },
];

type Mode = "login" | "register" | "confirm";

export default function Auth() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("login");

  // Account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Personal
  const [title, setTitle] = useState("Mr");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Phone
  const [countryCode, setCountryCode] = useState("+1");
  const [phone, setPhone] = useState("");

  // Address
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");

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

  function validatePassword(): string | null {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(password)) return "Password must contain at least one letter.";
    if (!/\d/.test(password)) return "Password must contain at least one number.";
    if (!PASSWORD_RE.test(password)) return "Password must not contain spaces, quotes, or commas.";
    return null;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const pwdError = validatePassword();
    if (pwdError) { setError(pwdError); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      await register(email, password, {
        title,
        first_name: firstName,
        last_name: lastName,
        phone: `${countryCode}${phone}`,
        address,
        city,
        zip,
      });
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
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 py-10">
      <div className={`w-full transition-all ${mode === "register" ? "max-w-xl" : "max-w-sm"}`}>
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

                {/* ── Personal info ── */}
                <div className="flex gap-2">
                  <select
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={`${SELECT_CLS} w-28 shrink-0`}
                  >
                    <option>Mr</option>
                    <option>Ms</option>
                    <option>Mrs</option>
                    <option>Dr</option>
                    <option>Prof</option>
                  </select>
                  <Input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                  />
                  <Input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                  />
                </div>

                {/* ── Account ── */}
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
                    Min 8 characters with at least one letter and one number. Spaces, quotes, and commas are not allowed.
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

                {/* ── Phone ── */}
                <div className="mt-1">
                  <p className="text-xs text-muted-foreground mb-1.5 px-1">
                    Phone — we'll send order status updates to this number
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className={`${SELECT_CLS} w-36 shrink-0`}
                    >
                      {COUNTRY_CODES.map(({ code, label }) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                    <Input
                      type="tel"
                      placeholder="Phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      required
                      autoComplete="tel-national"
                    />
                  </div>
                </div>

                {/* ── Delivery address ── */}
                <div className="mt-1">
                  <p className="text-xs text-muted-foreground mb-1.5 px-1">
                    Delivery address — orders will be shipped to this address
                  </p>
                  <div className="flex flex-col gap-2">
                    <Input
                      type="text"
                      placeholder="Street address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                      autoComplete="street-address"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="City"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                        autoComplete="address-level2"
                      />
                      <Input
                        type="text"
                        placeholder="ZIP"
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        required
                        autoComplete="postal-code"
                        className="w-32 shrink-0"
                      />
                    </div>
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 mt-2 rounded-full bg-primary-gradient text-white border-0"
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
