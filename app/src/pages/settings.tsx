import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import { ChevronRight, Pencil, Check, X } from "lucide-react";
import { signOut, fetchMe, updateMe, requestResetCode } from "@/lib/api-auth";
import { getAccessToken, clearTokens } from "@/lib/auth";
import { userStore, useProfile } from "@/lib/user-store";
import { getMissingProFieldLabels, isFreePlan, isProProfileComplete } from "@/lib/profile-requirements";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2">{title}</h2>
      <div className="vg-card divide-y divide-border overflow-hidden">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  action,
  destructive,
  onClick,
}: {
  label: string;
  value?: React.ReactNode;
  action?: React.ReactNode;
  destructive?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 ${
        onClick ? "hover:bg-muted/40 cursor-pointer" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${destructive ? "text-destructive" : "text-foreground"}`}>{label}</div>
        {value !== undefined && <div className="text-xs text-muted-foreground mt-0.5 truncate">{value}</div>}
      </div>
      {action}
    </div>
  );
}

function EditableRow({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  const submit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {editing ? (
          <div className="flex items-center gap-1 mt-1">
            <input
              autoFocus
              className="flex-1 min-w-0 border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setEditing(false); }}
              disabled={saving}
            />
            <button className="p-1 rounded hover:bg-muted text-primary shrink-0" onClick={submit} disabled={saving}>
              <Check className="w-4 h-4" />
            </button>
            <button className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0" onClick={() => setEditing(false)} disabled={saving}>
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{value || "—"}</div>
        )}
      </div>
      {!editing && (
        <button
          className="p-2 rounded-full hover:bg-muted text-muted-foreground shrink-0"
          onClick={() => setEditing(true)}
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function Toggle({ defaultOn = false, label }: { defaultOn?: boolean; label?: string }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      className="vg-toggle outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      data-on={on}
      onClick={() => setOn((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setOn((v) => !v);
        }
      }}
    />
  );
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
        active ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const profile = useProfile();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ Food: true, Flights: true, Hotels: false });
  const [activatingPro, setActivatingPro] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const autoUpgradeTriggeredRef = useRef(false);
  const togglePref = (k: string) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  const requiredMode = new URLSearchParams(window.location.search).get("required");
  const isForcedProProfile = requiredMode === "pro-profile";
  const freePlan = isFreePlan(profile);
  const proProfileComplete = isProProfileComplete(profile);
  const missingProFields = getMissingProFieldLabels(profile);

  // Fetch profile if not loaded yet
  useEffect(() => {
    if (!profile) {
      const token = getAccessToken();
      if (token) fetchMe(token).then((p) => userStore.set(p)).catch(() => null);
    }
  }, [profile]);

  const patchField = async (data: Parameters<typeof updateMe>[1]) => {
    const token = getAccessToken();
    if (!token) return;
    const updated = await updateMe(token, data);
    userStore.set(updated);
  };

  const handleLogout = async () => {
    const token = getAccessToken();
    if (token) {
      try { await signOut(token); } catch { /* clear locally even if API fails */ }
    }
    clearTokens();
    userStore.set(null);
    setLocation("/auth");
  };

  const handleDeleteAccount = () => {
    const userId = profile?.email ?? "unknown";
    window.location.href = `mailto:support@velago.ai?subject=${encodeURIComponent(`Delete user ${userId}`)}`;
  };

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.name || "";

  // Default address from profile
  const defaultAddr = (profile?.saved_addresses?.default ?? {}) as
    { address?: string; city?: string; postcode?: string; country?: string };

  const patchAddress = async (field: string, value: string) => {
    const updated = {
      ...profile?.saved_addresses,
      default: { ...defaultAddr, [field]: value },
    };
    await patchField({ saved_addresses: updated });
  };

  const activatePro = async () => {
    if (!freePlan || !proProfileComplete || activatingPro) return;
    setUpgradeError(null);
    setActivatingPro(true);
    try {
      await patchField({ plan: "pro" });
      setLocation("/voice");
    } catch {
      autoUpgradeTriggeredRef.current = false;
      setUpgradeError("Could not activate Pro yet. Please try again.");
    } finally {
      setActivatingPro(false);
    }
  };

  useEffect(() => {
    if (!profile || !freePlan || !proProfileComplete) return;
    if (autoUpgradeTriggeredRef.current || activatingPro) return;
    autoUpgradeTriggeredRef.current = true;
    void activatePro();
  }, [profile, freePlan, proProfileComplete, activatingPro]);

  return (
    <AppLayout>
      <div className="px-4 md:px-8 py-6 max-w-2xl w-full mx-auto">
        <h1 className="font-display text-2xl md:text-3xl font-bold mb-6">Settings</h1>

        {freePlan && (
          <section className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
            <div className="text-sm font-semibold text-foreground">Complete profile to activate Pro</div>
            {isForcedProProfile && (
              <p className="text-xs text-muted-foreground mt-1">
                Chat is locked for Free plan accounts until the required profile fields are completed.
              </p>
            )}
            {missingProFields.length > 0 ? (
              <p className="text-xs text-muted-foreground mt-2">
                Required: {missingProFields.join(", ")}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">All required fields are filled. Activating Pro plan…</p>
            )}
            {upgradeError && <p className="text-xs text-destructive mt-2">{upgradeError}</p>}
            <button
              type="button"
              className="mt-3 h-9 px-4 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-60"
              onClick={() => void activatePro()}
              disabled={missingProFields.length > 0 || activatingPro}
            >
              {activatingPro ? "Activating…" : "Activate Pro"}
            </button>
          </section>
        )}

        <Section title="Payment">
          <Row
            label="Revolut"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Connected
              </span>
            }
          />
          <Row label="Credit card" value="Visa ···· 4242 · 09/27" />
          <Row label="" value={<span className="text-primary font-semibold">+ Add payment method</span>} onClick={() => undefined} />
        </Section>

        <Section title="Account">
          <EditableRow label="Email" value={profile?.email ?? ""} onSave={(v) => patchField({ email: v })} />
          <EditableRow
            label="Full name"
            value={fullName}
            onSave={async (v) => {
              const parts = v.trim().split(/\s+/);
              await patchField({ first_name: parts[0] ?? "", last_name: parts.slice(1).join(" ") });
            }}
          />
          <EditableRow label="Phone" value={profile?.phone ?? profile?.phone_number ?? ""} onSave={(v) => patchField({ phone: v })} />
          <Row
            label="Reset password"
            value="A confirmation code will be sent to your email"
            action={
              <button
                className="text-sm font-semibold text-primary hover:underline"
                onClick={async () => {
                  const email = profile?.email;
                  if (!email) return;
                  try {
                    await requestResetCode(email);
                    clearTokens();
                    userStore.set(null);
                    setLocation(`/auth?reset=${encodeURIComponent(email)}`);
                  } catch { /* ignore */ }
                }}
              >
                Reset
              </button>
            }
          />
        </Section>

        <Section title="Default address">
          <EditableRow label="Street" value={defaultAddr.address ?? ""} onSave={(v) => patchAddress("address", v)} />
          <EditableRow label="City" value={defaultAddr.city ?? ""} onSave={(v) => patchAddress("city", v)} />
          <EditableRow label="Postcode" value={defaultAddr.postcode ?? ""} onSave={(v) => patchAddress("postcode", v)} />
          <EditableRow label="Country" value={defaultAddr.country ?? ""} onSave={(v) => patchAddress("country", v)} />
        </Section>

        <Section title="Preferences">
          <div className="px-4 py-3">
            <div className="text-sm font-semibold text-foreground mb-1">Preferred categories</div>
            <div className="text-xs text-muted-foreground mb-3">Tap to toggle</div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(prefs).map((k) => (
                <Chip key={k} active={prefs[k]} onClick={() => togglePref(k)}>
                  {k}
                </Chip>
              ))}
            </div>
          </div>
          <Row label="Language" value="English (UK)" action={<ChevronRight className="w-4 h-4 text-muted-foreground" />} />
        </Section>

        <Section title="Notifications">
          <Row label="Booking confirmations" action={<Toggle defaultOn label="Booking confirmations" />} />
          <Row label="Order status updates" action={<Toggle defaultOn label="Order status updates" />} />
          <Row label="Availability reminders" action={<Toggle defaultOn label="Availability reminders" />} />
          <Row label="Browser push notifications" action={<Toggle label="Browser push notifications" />} />
        </Section>

        <Section title="Danger zone">
          <Row label="Log out" destructive action={<ChevronRight className="w-4 h-4 text-destructive" />} onClick={handleLogout} />
          <Row label="Delete account" destructive action={<ChevronRight className="w-4 h-4 text-destructive/70" />} onClick={handleDeleteAccount} />
        </Section>

        <p className="text-center text-xs text-muted-foreground mt-4">VelaGo · v0.1 demo</p>
      </div>
    </AppLayout>
  );
}
