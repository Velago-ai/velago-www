import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import { type Category } from "@/lib/placeholder-data";
import { Search, ChevronDown, ChevronRight, RotateCcw, Utensils, Plane, Package, Hotel, FileDown } from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { listOrders, reorderOrder, type OrderListItem, type OrdersPageResponse } from "@/lib/api-auth";
import { downloadOrderConfirmation, orderConfirmationLabel } from "@/lib/order-confirmation-pdf";
import { savePendingReorderFlow } from "@/lib/reorder-flow";

const CATEGORY_ICON: Record<Category, { Icon: typeof Utensils; bg: string; color: string }> = {
  food: { Icon: Utensils, bg: "bg-emerald-100", color: "text-emerald-600" },
  flight: { Icon: Plane, bg: "bg-sky-100", color: "text-sky-600" },
  parcel: { Icon: Package, bg: "bg-amber-100", color: "text-amber-600" },
  hotel: { Icon: Hotel, bg: "bg-purple-100", color: "text-purple-600" },
};

const FILTERS = ["All", "Flights", "Parcel delivery"] as const;
const PER_PAGE = 20;
type Filter = (typeof FILTERS)[number];

interface UiOrder {
  id: string;
  reorderOrderId?: string;
  category: Category;
  provider: string;
  service: string;
  date: string;
  price: string;
  statusRaw: string;
  status: string;
  reference: string;
  details: { label: string; value: string }[];
}

function statusKey(status: string): string {
  return status.trim().toLowerCase();
}

function isPastStatus(status: string): boolean {
  const key = statusKey(status);
  return key === "completed" || key === "failed" || key === "canceled" || key === "cancelled";
}

function titleCase(value: string): string {
  if (!value) return value;
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function humanizeStatus(rawStatus: string): string {
  const normalized = rawStatus.replace(/[_-]+/g, " ").trim();
  return titleCase(normalized || "unknown");
}

function isDeliveryLikeCategory(category: Category): boolean {
  return category === "parcel" || category === "food";
}

function mapDisplayStatus(rawStatus: string, category: Category): string {
  const key = statusKey(rawStatus);
  const deliveryLike = isDeliveryLikeCategory(category);

  if (key === "completed" || key === "complete") return "Completed";
  if (key === "failed") return "Failed";
  if (key === "canceled" || key === "cancelled") return "Canceled";
  if (key === "paid") return "Paid";

  if (key === "payment_requires_action" || key === "requires_action" || key === "pending_payment" || key === "unpaid") {
    return "Awaiting Payment";
  }

  if (
    key === "in_transit" ||
    key === "out_for_delivery" ||
    key === "shipped" ||
    key === "dispatched" ||
    key === "courier_assigned" ||
    key === "picked_up"
  ) {
    return "Delivery";
  }

  if (key === "in_progress" || key === "in-progress" || key === "processing" || key === "pending" || key === "created") {
    return deliveryLike ? "Delivery" : "In Progress";
  }

  return humanizeStatus(rawStatus);
}

function StatusChip({ status }: { status: string }) {
  const key = statusKey(status);
  const cls =
    key.includes("fail") || key.includes("cancel")
      ? "vg-chip-cancelled"
      : key.includes("complete") || key.includes("paid") || key.includes("settled")
        ? "vg-chip-completed"
        : "vg-chip-pending";
  return <span className={`vg-chip ${cls}`}>{status || "unknown"}</span>;
}

function CategoryAvatar({ category }: { category: Category }) {
  const { Icon, bg, color } = CATEGORY_ICON[category];
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
      <Icon className={`w-4 h-4 ${color}`} />
    </div>
  );
}

function matchesFilter(filter: Filter, category: Category): boolean {
  if (filter === "All") return true;
  if (filter === "Flights") return category === "flight";
  return category === "parcel";
}

function filterToApiCategory(filter: Filter): string | undefined {
  if (filter === "Flights") return "flights";
  if (filter === "Parcel delivery") return "parcel_delivery";
  return undefined;
}

function extractOrderItems(response: OrdersPageResponse): OrderListItem[] {
  const list = response.items ?? response.results ?? response.data ?? [];
  return Array.isArray(list) ? list : [];
}

function normalizeCategory(value: unknown): Category | null {
  const v = String(value ?? "").toLowerCase();
  if (v === "flights" || v.includes("flight") || v.includes("air")) return "flight";
  if (v === "parcel_delivery" || v.includes("parcel")) return "parcel";
  return null;
}

function firstString(values: unknown[], fallback: string): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function firstOptionalString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function formatDate(value: unknown): string {
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

function toUiOrder(order: OrderListItem, index: number): UiOrder | null {
  const category = normalizeCategory(order.category ?? order.service_name ?? order.service);
  if (!category) return null;

  const statusRaw = firstString([order.status], "unknown");
  const status = mapDisplayStatus(statusRaw, category);
  const provider = firstString([order.provider, order.supplier, order.service_name], "Velago");
  const service = firstString(
    [order.service, order.service_name, order.category],
    category === "flight" ? "flights" : "parcel_delivery",
  );
  const reference = firstString(
    [order.meshhub_order_id, order.order_id, order.id, order.supplier_order_id],
    `order-${index + 1}`,
  );

  const details: { label: string; value: string }[] = [
    { label: "Status", value: status },
    { label: "Order ID", value: firstString([order.id, order.order_id], "n/a") },
  ];
  if (typeof order.meshhub_order_id === "string" && order.meshhub_order_id) {
    details.push({ label: "MeshHub ID", value: order.meshhub_order_id });
  }
  if (typeof order.supplier_order_id === "string" && order.supplier_order_id) {
    details.push({ label: "Supplier ID", value: order.supplier_order_id });
  }
  if (typeof order.expires_at === "string" && order.expires_at) {
    details.push({ label: "Expires", value: formatDate(order.expires_at) });
  }

  const reorderOrderId = firstOptionalString([order.id]);

  return {
    id: firstString([order.id, order.order_id, order.meshhub_order_id], `row-${index}`),
    reorderOrderId,
    category,
    provider,
    service,
    date: formatDate(order.created_at),
    price: formatPrice(order.price, order.currency),
    statusRaw,
    status,
    reference,
    details,
  };
}

export default function Bookings() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<Filter>("All");
  const [openActive, setOpenActive] = useState<string | null>(null);
  const [openPast, setOpenPast] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [orders, setOrders] = useState<UiOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  useEffect(() => {
    setOrdersPage(1);
    setOpenActive(null);
    setOpenPast(null);
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

    const run = async () => {
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const category = filterToApiCategory(filter);
        const response = await listOrders(token, { category, page: ordersPage, per_page: PER_PAGE });
        const items = extractOrderItems(response);
        const mapped = items
          .map((order, index) => toUiOrder(order, index))
          .filter((order): order is UiOrder => order != null)
          .filter((order) => matchesFilter(filter, order.category));
        const total = Number(response.total ?? mapped.length);

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

  const query = search.trim().toLowerCase();
  const visibleOrders = useMemo(() => {
    if (!query) return orders;
    return orders.filter((o) =>
      [o.provider, o.service, o.reference, o.status, o.statusRaw].some((v) => v.toLowerCase().includes(query)),
    );
  }, [orders, query]);

  const activeOrders = useMemo(() => visibleOrders.filter((o) => !isPastStatus(o.statusRaw)), [visibleOrders]);
  const pastOrders = useMemo(() => visibleOrders.filter((o) => isPastStatus(o.statusRaw)), [visibleOrders]);

  const canPrev = ordersPage > 1;
  const canNext = ordersPage * PER_PAGE < ordersTotal;

  const handleReorder = async (orderId?: string) => {
    if (reorderLoading) return;
    if (!orderId) {
      setReorderError("Could not reorder this booking: missing order id.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setReorderError("Sign in to reorder bookings.");
      return;
    }

    setReorderLoading(true);
    setReorderError(null);
    try {
      const reorderPayload = await reorderOrder(token, orderId);
      savePendingReorderFlow(reorderPayload);
      setLocation("/voice?reorder=last");
    } catch (error) {
      setReorderError(error instanceof Error ? error.message : "Failed to reorder booking.");
    } finally {
      setReorderLoading(false);
    }
  };

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
              placeholder="Search bookings..."
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
            {!ordersLoading && !ordersError && activeOrders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">No active bookings.</p>
            )}

            {!ordersLoading &&
              !ordersError &&
              activeOrders.map((o, i) => {
                const open = openActive === o.id;
                return (
                  <div key={o.id} className="vg-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <CategoryAvatar category={o.category} />
                      <button onClick={() => setOpenActive(open ? null : o.id)} className="flex-1 min-w-0 text-left">
                        <div className="font-semibold text-foreground">{o.provider}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.service} - {o.date} - <span className="font-semibold text-foreground">{o.price}</span>
                        </div>
                      </button>
                      <StatusChip status={o.status} />
                      <button
                        type="button"
                        className="hidden sm:inline-flex vg-chip vg-chip-info gap-1 hover:opacity-80 disabled:opacity-60"
                        disabled={reorderLoading || !o.reorderOrderId}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleReorder(o.reorderOrderId);
                        }}
                      >
                        <RotateCcw className="w-3 h-3" /> {reorderLoading ? "Reordering..." : "Reorder"}
                      </button>
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    {open && (
                      <div className="px-4 pb-4 bg-muted/30">
                        <div className="rounded-2xl bg-white border border-border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                            Receipt - {o.reference}
                          </div>
                          <div className="space-y-2">
                            {o.details.map((d) => (
                              <div key={d.label} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{d.label}</span>
                                <span className="font-medium text-foreground text-right">{d.value}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-sm pt-2 border-t border-border">
                              <span className="text-muted-foreground">Total</span>
                              <span className="font-bold text-foreground">{o.price}</span>
                            </div>
                          </div>
                          <div className="rounded-xl border border-border p-3 bg-secondary/50 text-sm mt-4">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="font-semibold">Booking confirmation</div>
                              <span className="text-xs text-muted-foreground">PDF - ready</span>
                            </div>
                            <p className="text-muted-foreground mb-3">
                              Your {orderConfirmationLabel(o.category).replace(" (PDF)", "").toLowerCase()} is ready to
                              download.
                            </p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadOrderConfirmation(o);
                              }}
                              className="vg-btn-primary py-2 px-4 text-sm w-full sm:w-auto"
                            >
                              <FileDown className="w-4 h-4" /> Download {orderConfirmationLabel(o.category)}
                            </button>
                          </div>
                          <div className="flex gap-2 mt-4 sm:hidden">
                            <button
                              type="button"
                              className="vg-btn-ghost py-2 px-4 text-sm flex-1 disabled:opacity-60"
                              disabled={reorderLoading || !o.reorderOrderId}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleReorder(o.reorderOrderId);
                              }}
                            >
                              <RotateCcw className="w-4 h-4" /> {reorderLoading ? "Reordering..." : "Reorder"}
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
          {reorderError && <p className="text-sm text-destructive mb-3 px-1">{reorderError}</p>}
          <div className="vg-card divide-y divide-border overflow-hidden">
            {!ordersLoading && !ordersError && pastOrders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">No past bookings.</p>
            )}

            {!ordersLoading &&
              !ordersError &&
              pastOrders.map((o, i) => {
                const open = openPast === o.id;
                return (
                  <div key={o.id} className="vg-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <CategoryAvatar category={o.category} />
                      <button onClick={() => setOpenPast(open ? null : o.id)} className="flex-1 min-w-0 text-left">
                        <div className="font-semibold text-foreground">{o.provider}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.service} - {o.date} - <span className="font-semibold text-foreground">{o.price}</span>
                        </div>
                      </button>
                      <StatusChip status={o.status} />
                      <button
                        type="button"
                        className="hidden sm:inline-flex vg-chip vg-chip-info gap-1 hover:opacity-80 disabled:opacity-60"
                        disabled={reorderLoading || !o.reorderOrderId}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleReorder(o.reorderOrderId);
                        }}
                      >
                        <RotateCcw className="w-3 h-3" /> {reorderLoading ? "Reordering..." : "Reorder"}
                      </button>
                    </div>
                    {open && (
                      <div className="px-4 pb-4 bg-muted/30">
                        <div className="rounded-2xl bg-white border border-border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                            Receipt - {o.reference}
                          </div>
                          <div className="space-y-2">
                            {o.details.map((d) => (
                              <div key={d.label} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{d.label}</span>
                                <span className="font-medium text-foreground text-right">{d.value}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-sm pt-2 border-t border-border">
                              <span className="text-muted-foreground">Total</span>
                              <span className="font-bold text-foreground">{o.price}</span>
                            </div>
                          </div>
                          <div className="rounded-xl border border-border p-3 bg-secondary/50 text-sm mt-4">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="font-semibold">Booking confirmation</div>
                              <span className="text-xs text-muted-foreground">PDF - ready</span>
                            </div>
                            <p className="text-muted-foreground mb-3">
                              Your {orderConfirmationLabel(o.category).replace(" (PDF)", "").toLowerCase()} is ready to
                              download.
                            </p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadOrderConfirmation(o);
                              }}
                              className="vg-btn-primary py-2 px-4 text-sm w-full sm:w-auto"
                            >
                              <FileDown className="w-4 h-4" /> Download {orderConfirmationLabel(o.category)}
                            </button>
                          </div>
                          <div className="flex gap-2 mt-4 sm:hidden">
                            <button
                              type="button"
                              className="vg-btn-ghost py-2 px-4 text-sm flex-1 disabled:opacity-60"
                              disabled={reorderLoading || !o.reorderOrderId}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleReorder(o.reorderOrderId);
                              }}
                            >
                              <RotateCcw className="w-4 h-4" /> {reorderLoading ? "Reordering..." : "Reorder"}
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
                {ordersTotal > 0 ? ` - ${ordersTotal} total` : ""}
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
