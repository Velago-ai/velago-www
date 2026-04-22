import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { CHAT_SESSIONS, type Category, type ChatSession, type BookingRecord } from "@/lib/placeholder-data";
import { Search, ChevronRight, ChevronDown, Utensils, Plane, Package, Hotel, RotateCcw, FileDown } from "lucide-react";
import { downloadConfirmation, confirmationLabel } from "@/lib/confirmation-pdf";
import { getAccessToken } from "@/lib/auth";
import { listOrders, type OrderListItem, type OrdersPageResponse } from "@/lib/api-auth";

const CATEGORY_ICON: Record<Category, { Icon: typeof Utensils; bg: string; color: string }> = {
  food: { Icon: Utensils, bg: "bg-emerald-100", color: "text-emerald-600" },
  flight: { Icon: Plane, bg: "bg-sky-100", color: "text-sky-600" },
  parcel: { Icon: Package, bg: "bg-amber-100", color: "text-amber-600" },
  hotel: { Icon: Hotel, bg: "bg-purple-100", color: "text-purple-600" },
};

const FILTERS = ["All", "Flights", "Parcel delivery"] as const;
const PER_PAGE = 20;

type Filter = (typeof FILTERS)[number];

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

function matchesFilter(filter: Filter, cat: Category) {
  if (filter === "All") return true;
  if (filter === "Flights") return cat === "flight";
  if (filter === "Parcel delivery") return cat === "parcel";
  return true;
}

function filterToApiCategories(filter: Filter): string[] {
  if (filter === "Flights") return ["flights"];
  if (filter === "Parcel delivery") return ["parcel_delivery"];
  return [];
}

function extractOrderItems(data: OrdersPageResponse): OrderListItem[] {
  const list = data.items ?? data.results ?? data.data ?? [];
  return Array.isArray(list) ? list : [];
}

function normalizeCategory(value: unknown): Category | null {
  const v = String(value ?? "").toLowerCase();
  if (v === "flights" || v.includes("flight") || v.includes("air")) return "flight";
  if (v === "parcel_delivery" || v.includes("parcel")) return "parcel";
  return null;
}

function normalizeStatus(value: unknown): BookingRecord["status"] {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("cancel") || v.includes("fail") || v.includes("declin") || v.includes("expired")) {
    return "Cancelled";
  }
  if (v.includes("complete") || v.includes("paid") || v.includes("settled")) return "Completed";
  return "Confirmed";
}

function readFirstString(values: unknown[], fallback: string): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function formatOrderDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Unknown date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function formatPrice(price: unknown, currency: unknown): string {
  const ccy = String(currency ?? "EUR").toUpperCase();
  const parsed =
    typeof price === "number" ? price : typeof price === "string" && price.trim() ? Number(price) : Number.NaN;
  if (Number.isFinite(parsed)) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(parsed);
    } catch {
      return `${parsed.toFixed(2)} ${ccy}`;
    }
  }
  return `- ${ccy}`;
}

function orderToBooking(order: OrderListItem, index: number): BookingRecord | null {
  const category = normalizeCategory(order.category ?? order.service_name ?? order.service);
  if (!category) return null;
  const provider = readFirstString([order.provider, order.supplier, order.service_name], "Velago");
  const service = readFirstString(
    [order.service, order.service_name, order.category],
    category === "flight" ? "Flight" : "Parcel delivery",
  );

  const reference = readFirstString(
    [order.meshhub_order_id, order.order_id, order.id, order.supplier_order_id],
    `order-${index + 1}`,
  );

  const details: { label: string; value: string }[] = [
    { label: "Status", value: String(order.status ?? "unknown") },
    { label: "Order ID", value: readFirstString([order.id, order.order_id], "n/a") },
  ];
  if (typeof order.meshhub_order_id === "string" && order.meshhub_order_id) {
    details.push({ label: "MeshHub ID", value: order.meshhub_order_id });
  }
  if (typeof order.supplier_order_id === "string" && order.supplier_order_id) {
    details.push({ label: "Supplier ID", value: order.supplier_order_id });
  }
  if (typeof order.expires_at === "string" && order.expires_at) {
    details.push({ label: "Expires", value: formatOrderDate(order.expires_at) });
  }

  return {
    id: readFirstString([order.id, order.order_id, order.meshhub_order_id], `row-${index}`),
    provider,
    service,
    category,
    date: formatOrderDate(order.created_at),
    price: formatPrice(order.price, order.currency),
    status: normalizeStatus(order.status),
    reference,
    details,
  };
}

export default function Bookings() {
  const [filter, setFilter] = useState<Filter>("All");
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [orders, setOrders] = useState<BookingRecord[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);

  const sessions = useMemo(
    () =>
      CHAT_SESSIONS.filter(
        (s) => matchesFilter(filter, s.category) && s.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [filter, search],
  );

  useEffect(() => {
    setOrdersPage(1);
    setOpenBooking(null);
  }, [filter]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setOrders([]);
      setOrdersTotal(0);
      setOrdersLoading(false);
      setOrdersError("Sign in to view your order history.");
      return;
    }

    let cancelled = false;
    const categoryCandidates = filterToApiCategories(filter);

    const run = async () => {
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        let response: OrdersPageResponse | null = null;
        let items: OrderListItem[] = [];

        if (categoryCandidates.length === 0) {
          response = await listOrders(token, { page: ordersPage, per_page: PER_PAGE });
          items = extractOrderItems(response);
        } else {
          for (let i = 0; i < categoryCandidates.length; i++) {
            const category = categoryCandidates[i];
            const candidateResponse = await listOrders(token, {
              category,
              page: ordersPage,
              per_page: PER_PAGE,
            });
            const candidateItems = extractOrderItems(candidateResponse);
            response = candidateResponse;
            items = candidateItems;
            if (candidateItems.length > 0 || i === categoryCandidates.length - 1) break;
          }
        }

        const mapped = items
          .map((order, index) => orderToBooking(order, index))
          .filter((b): b is BookingRecord => b != null)
          .filter((b) => matchesFilter(filter, b.category));
        const total = Number(response?.total ?? mapped.length);

        if (!cancelled) {
          setOrders(mapped);
          setOrdersTotal(Number.isFinite(total) ? total : mapped.length);
        }
      } catch (error) {
        if (!cancelled) {
          setOrders([]);
          setOrdersTotal(0);
          setOrdersError(error instanceof Error ? error.message : "Failed to load orders");
        }
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [filter, ordersPage, reloadSeq]);

  const canPrev = ordersPage > 1;
  const canNext = ordersPage * PER_PAGE < ordersTotal;

  return (
    <AppLayout>
      <div className="px-4 md:px-8 py-6 max-w-3xl w-full mx-auto flex flex-col gap-8">
        <section>
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-4">My bookings</h1>

          <div className="relative mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search past chats..."
              className="w-full h-11 pl-11 pr-4 rounded-full bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

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
                            {s.title.toLowerCase().startsWith("flight")
                              ? "Cheapest flight to Madrid next Friday."
                              : `New ${s.title.toLowerCase()} please.`}
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
                            <span className="text-xs text-muted-foreground">PDF - ready</span>
                          </div>
                          <p className="text-muted-foreground mb-3">
                            Your {confirmationLabel(s.category).replace(" (PDF)", "").toLowerCase()} is ready to download.
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadConfirmation(s);
                            }}
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

        <section>
          <h2 className="font-display text-xl md:text-2xl font-bold mb-4">Past bookings</h2>

          <div className="vg-card divide-y divide-border overflow-hidden">
            {ordersLoading && (
              <p className="text-sm text-muted-foreground text-center py-10">Loading orders...</p>
            )}
            {!ordersLoading && ordersError && (
              <div className="py-8 px-4 text-center">
                <p className="text-sm text-muted-foreground">{ordersError}</p>
                <button className="vg-btn-primary mt-3 py-2 px-4 text-sm" onClick={() => setReloadSeq((v) => v + 1)}>
                  Retry
                </button>
              </div>
            )}
            {!ordersLoading && !ordersError && orders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">No orders found.</p>
            )}

            {!ordersLoading &&
              !ordersError &&
              orders.map((b, i) => {
                const open = openBooking === b.id;
                return (
                  <div key={b.id} className="vg-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <CategoryAvatar category={b.category} />
                      <button onClick={() => setOpenBooking(open ? null : b.id)} className="flex-1 min-w-0 text-left">
                        <div className="font-semibold text-foreground">{b.provider}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.service} - {b.date} - <span className="font-semibold text-foreground">{b.price}</span>
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
                            Receipt - {b.reference}
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

          {!ordersLoading && !ordersError && (
            <div className="flex items-center justify-between mt-3 px-1">
              <div className="text-xs text-muted-foreground">
                Page {ordersPage}
                {ordersTotal > 0 ? ` · ${ordersTotal} total` : ""}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                  className="vg-chip vg-chip-info disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => setOrdersPage((p) => p + 1)}
                  className="vg-chip vg-chip-info disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
