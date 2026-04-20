import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import { ChevronRight, Pencil, Check, X } from "lucide-react";
import { signOut, fetchMe, updateMe } from "@/lib/api-auth";
import { getAccessToken, clearTokens } from "@/lib/auth";
import { userStore, useProfile } from "@/lib/user-store";

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

function InlineEdit({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <button
        className="p-2 rounded-full hover:bg-muted text-muted-foreground"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      >
        <Pencil className="w-4 h-4" />
      </button>
    );
  }

  const submit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        className="border border-border rounded px-2 py-1 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-primary/40"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
      />
      <button className="p-1 rounded hover:bg-muted text-primary" onClick={submit} disabled={saving}>
        <Check className="w-4 h-4" />
      </button>
      <button className="p-1 rounded hover:bg-muted text-muted-foreground" onClick={() => setEditing(false)} disabled={saving}>
        <X className="w-4 h-4" />
      </button>
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
  const togglePref = (k: string) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

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

  // Parse default address from profile
  const defaultAddr = profile?.saved_addresses?.default as
    | { address?: string; city?: string; postcode?: string; country?: string }
    | undefined;
  const defaultAddrStr = defaultAddr
    ? [defaultAddr.address, defaultAddr.city, defaultAddr.postcode, defaultAddr.country].filter(Boolean).join(", ")
    : "";

  return (
    <AppLayout>
      <div className="px-4 md:px-8 py-6 max-w-2xl w-full mx-auto">
        <h1 className="font-display text-2xl md:text-3xl font-bold mb-6">Settings</h1>

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
          <Row
            label="Email"
            value={profile?.email ?? "—"}
            action={<InlineEdit value={profile?.email ?? ""} onSave={(v) => patchField({ email: v })} />}
          />
          <Row
            label="Full name"
            value={fullName || "—"}
            action={
              <InlineEdit
                value={fullName}
                onSave={async (v) => {
                  const parts = v.trim().split(/\s+/);
                  const first_name = parts[0] ?? "";
                  const last_name = parts.slice(1).join(" ");
                  await patchField({ first_name, last_name });
                }}
              />
            }
          />
          <Row
            label="Phone"
            value={profile?.phone ?? profile?.phone_number ?? "—"}
            action={<InlineEdit value={profile?.phone ?? profile?.phone_number ?? ""} onSave={(v) => patchField({ phone: v })} />}
          />
        </Section>

        <Section title="Default address">
          {defaultAddrStr ? (
            <Row
              label="Address"
              value={defaultAddrStr}
              action={
                <InlineEdit
                  value={defaultAddrStr}
                  onSave={async (v) => {
                    const parts = v.split(",").map((s) => s.trim());
                    const updated = {
                      ...profile?.saved_addresses,
                      default: {
                        address: parts[0] ?? "",
                        city: parts[1] ?? "",
                        postcode: parts[2] ?? "",
                        country: parts[3] ?? "",
                      },
                    };
                    await patchField({ saved_addresses: updated });
                  }}
                />
              }
            />
          ) : (
            <Row label="" value={<span className="text-muted-foreground text-xs">No saved address</span>} />
          )}
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
