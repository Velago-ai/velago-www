import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { CHAT_SESSIONS, BOOKINGS, type Category, type ChatSession, type BookingRecord } from "@/lib/placeholder-data";
import { Search, ChevronRight, ChevronDown, Utensils, Plane, Package, Hotel, RotateCcw, FileDown } from "lucide-react";
import { downloadConfirmation, confirmationLabel } from "@/lib/confirmation-pdf";

const CATEGORY_ICON: Record<Category, { Icon: typeof Utensils; bg: string; color: string }> = {
  food:   { Icon: Utensils, bg: "bg-emerald-100", color: "text-emerald-600" },
  flight: { Icon: Plane,    bg: "bg-sky-100",     color: "text-sky-600"     },
  parcel: { Icon: Package,  bg: "bg-amber-100",   color: "text-amber-600"   },
  hotel:  { Icon: Hotel,    bg: "bg-purple-100",  color: "text-purple-600"  },
};

const FILTERS = ["All", "Food", "Flights", "Hotels", "More…"] as const;

function StatusChip({ status }: { status: ChatSession["status"] | BookingRecord["status"] }) {
  const cls =
    status === "Confirmed"
      ? "vg-chip-confirmed"
      : status === "Completed"
      ? "vg-chip-completed"
      : status === "Pending"
      ? "vg-chip-pending"
      : "vg-chip-cancelled";
  return <span className={`vg-chip ${cls}`}>{status}</span>;
}

function CategoryAvatar({ category }: { category: Category }) {
  const { Icon, bg, color } = CATEGORY_ICON[category];
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
      <Icon className={`w-4 h-4 ${color}`} />
    </div>
  );
}

export default function Bookings() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const matchesFilter = (cat: Category) => {
    if (filter === "All" || filter === "More…") return true;
    if (filter === "Food") return cat === "food";
    if (filter === "Flights") return cat === "flight";
    if (filter === "Hotels") return cat === "hotel";
    return true;
  };

  const sessions = CHAT_SESSIONS.filter(
    (s) => matchesFilter(s.category) && s.title.toLowerCase().includes(search.toLowerCase()),
  );
  const bookings = BOOKINGS.filter((b) => matchesFilter(b.category));

  return (
    <AppLayout>
      <div className="px-4 md:px-8 py-6 max-w-3xl w-full mx-auto flex flex-col gap-8">
        {/* Section A — My bookings */}
        <section>
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-4">My bookings</h1>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search past chats…"
              className="w-full h-11 pl-11 pr-4 rounded-full bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
            {FILTERS.map((f) => {
              const active = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary text-white"
                      : "bg-white text-muted-foreground border border-border hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>

          <div className="vg-card divide-y divide-border overflow-hidden">
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">No chats match.</p>
            )}
            {sessions.map((s, i) => {
              const open = openSession === s.id;
              return (
                <div key={s.id} className="vg-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                  <button
                    onClick={() => setOpenSession(open ? null : s.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <CategoryAvatar category={s.category} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate">{s.title}</div>
                      <div className="text-xs text-muted-foreground">{s.date}</div>
                    </div>
                    <StatusChip status={s.status} />
                    {open ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 bg-muted/30">
                      <div className="rounded-2xl bg-white border border-border p-4 space-y-3">
                        <div className="flex justify-end">
                          <div className="bg-primary text-white text-sm rounded-full rounded-tr-md px-4 py-2 max-w-[70%]">
                            {s.title.toLowerCase().startsWith("flight") ? "Cheapest flight to Madrid next Friday." : `New ${s.title.toLowerCase()} please.`}
                          </div>
                        </div>
                        <div className="flex">
                          <div className="bg-muted text-foreground text-sm rounded-2xl rounded-tl-md px-4 py-2 max-w-[80%]">
                            {s.preview}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border p-3 bg-secondary/50 text-sm">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="font-semibold">Booking confirmation</div>
                            <span className="text-xs text-muted-foreground">PDF · ready</span>
                          </div>
                          <p className="text-muted-foreground mb-3">
                            Your {confirmationLabel(s.category).replace(" (PDF)", "").toLowerCase()} is ready to download.
                          </p>
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadConfirmation(s); }}
                            className="vg-btn-primary py-2 px-4 text-sm w-full sm:w-auto"
                          >
                            <FileDown className="w-4 h-4" /> Download {confirmationLabel(s.category)}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section B — Past bookings */}
        <section>
          <h2 className="font-display text-xl md:text-2xl font-bold mb-4">Past bookings</h2>

          <div className="vg-card divide-y divide-border overflow-hidden">
            {bookings.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">No bookings match.</p>
            )}
            {bookings.map((b, i) => {
              const open = openBooking === b.id;
              return (
                <div key={b.id} className="vg-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <CategoryAvatar category={b.category} />
                    <button
                      onClick={() => setOpenBooking(open ? null : b.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="font-semibold text-foreground">{b.provider}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.service} · {b.date} · <span className="font-semibold text-foreground">{b.price}</span>
                      </div>
                    </button>
                    <StatusChip status={b.status} />
                    <button className="hidden sm:inline-flex vg-chip vg-chip-info gap-1 hover:opacity-80">
                      <RotateCcw className="w-3 h-3" /> Reorder
                    </button>
                  </div>
                  {open && (
                    <div className="px-4 pb-4 bg-muted/30">
                      <div className="rounded-2xl bg-white border border-border p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                          Receipt · {b.reference}
                        </div>
                        <div className="space-y-2">
                          {b.details.map((d) => (
                            <div key={d.label} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{d.label}</span>
                              <span className="font-medium text-foreground text-right">{d.value}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm pt-2 border-t border-border">
                            <span className="text-muted-foreground">Total</span>
                            <span className="font-bold text-foreground">{b.price}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4 sm:hidden">
                          <button className="vg-btn-ghost py-2 px-4 text-sm flex-1">
                            <RotateCcw className="w-4 h-4" /> Reorder
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
