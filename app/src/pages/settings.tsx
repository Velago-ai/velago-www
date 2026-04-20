import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { PLACEHOLDER_USER, SAVED_ADDRESSES } from "@/lib/placeholder-data";
import { ChevronRight, Pencil } from "lucide-react";

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

function EditLink({ children = "Edit" }: { children?: React.ReactNode }) {
  return <button className="text-sm font-semibold text-primary hover:underline">{children}</button>;
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
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ Food: true, Flights: true, Hotels: false });
  const togglePref = (k: string) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

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
            action={<EditLink>Manage</EditLink>}
          />
          <Row label="Credit card" value="Visa ···· 4242 · 09/27" action={<EditLink>Change</EditLink>} />
          <Row label="" value={<span className="text-primary font-semibold">+ Add payment method</span>} onClick={() => undefined} />
        </Section>

        <Section title="Account">
          <Row label="Email" value={PLACEHOLDER_USER.email} action={<EditLink />} />
          <Row label="Full name" value={PLACEHOLDER_USER.fullName} action={<EditLink />} />
          <Row label="Password" value="Not set" action={<EditLink>Set password</EditLink>} />
        </Section>

        <Section title="Addresses">
          {SAVED_ADDRESSES.map((a) => (
            <Row
              key={a.id}
              label={a.label}
              value={a.value}
              action={
                <button className="p-2 rounded-full hover:bg-muted text-muted-foreground">
                  <Pencil className="w-4 h-4" />
                </button>
              }
            />
          ))}
          <Row label="" value={<span className="text-primary font-semibold">+ Add address</span>} onClick={() => undefined} />
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
          <Row label="Log out" destructive action={<ChevronRight className="w-4 h-4 text-destructive" />} onClick={() => undefined} />
          <Row label="Delete account" destructive action={<ChevronRight className="w-4 h-4 text-destructive/70" />} onClick={() => undefined} />
        </Section>

        <p className="text-center text-xs text-muted-foreground mt-4">VelaGo · v0.1 demo</p>
      </div>
    </AppLayout>
  );
}
