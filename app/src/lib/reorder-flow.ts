export const REORDER_CHAT_MESSAGE = "Vela please reorder this booking with new dates.";
export const REORDER_CHAT_MESSAGE_FLIGHT =
  "Vela please reorder my last flight booking with new departure and return dates (category: flights).";
export const REORDER_CHAT_MESSAGE_PARCEL =
  "Vela please reorder my last parcel delivery booking (category: parcel_delivery).";

const REORDER_FLOW_STORAGE_KEY = "velago_reorder_flow";

export interface PendingReorderFlow {
  createdAt: number;
  message: string;
  order: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function firstString(obj: Record<string, unknown>, paths: string[]): string | undefined {
  for (const p of paths) {
    const v = readPath(obj, p);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function firstNumber(obj: Record<string, unknown>, paths: string[]): number | undefined {
  for (const p of paths) {
    const v = readPath(obj, p);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function normalizeIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function buildFlightReorderMessage(source: Record<string, unknown>): string | null {
  const from = firstString(source, [
    "details.origin_iata",
    "details.origin",
    "details.from",
    "details.departure_city",
    "details.origin_city",
    "reorder_payload.details.origin_iata",
    "reorder_payload.details.origin",
  ]);
  const to = firstString(source, [
    "details.destination_iata",
    "details.destination",
    "details.to",
    "details.destination_city",
    "reorder_payload.details.destination_iata",
    "reorder_payload.details.destination",
  ]);
  const departureDate = normalizeIsoDate(
    firstString(source, [
      "details.departure_date",
      "details.depart_date",
      "details.outbound_date",
      "reorder_payload.details.departure_date",
      "reorder_payload.details.depart_date",
      "reorder_payload.details.outbound_date",
    ])
  );
  const returnDate = normalizeIsoDate(
    firstString(source, [
      "details.return_date",
      "details.inbound_date",
      "reorder_payload.details.return_date",
      "reorder_payload.details.inbound_date",
    ])
  );
  const orderId = firstString(source, [
    "selected_order_id",
    "order_id",
    "id",
    "meshhub_order_id",
    "supplier_order_id",
    "reorder_payload.order_id",
    "data.order_id",
    "result.order_id",
  ]);

  if (!from || !to || !departureDate || !returnDate) return null;
  const orderPart = orderId ? `, order id ${orderId}` : "";
  return `Vela please reorder this flight from ${from} to ${to}, departure date ${departureDate}, return date ${returnDate}${orderPart}.`;
}

function buildParcelReorderMessage(source: Record<string, unknown>): string | null {
  const from = firstString(source, [
    "details.origin_country",
    "details.origin",
    "reorder_payload.details.origin_country",
  ]);
  const to = firstString(source, [
    "details.destination_country",
    "details.destination",
    "reorder_payload.details.destination_country",
  ]);
  const weight = firstNumber(source, [
    "details.weight_kg",
    "details.parcel_weight_kg",
    "details.weight",
    "reorder_payload.details.weight_kg",
  ]);
  const deliveryType = firstString(source, [
    "details.delivery_type",
    "details.service_type",
    "reorder_payload.details.delivery_type",
  ]);
  const orderId = firstString(source, [
    "selected_order_id",
    "order_id",
    "id",
    "meshhub_order_id",
    "supplier_order_id",
    "reorder_payload.order_id",
    "data.order_id",
    "result.order_id",
  ]);

  if (!from || !to || weight == null) return null;
  const deliveryPart = deliveryType ? `, delivery type ${deliveryType}` : "";
  const orderPart = orderId ? `, order id ${orderId}` : "";
  return `Vela please reorder this parcel from ${from} to ${to}, weight ${weight.toFixed(2)} kg${deliveryPart}${orderPart}.`;
}

function buildReorderMessage(order: unknown): string {
  const root = asRecord(order);
  const data = asRecord(root.data);
  const result = asRecord(root.result);
  const nestedOrder = asRecord(root.order);
  const reorderPayload = asRecord(root.reorder_payload);
  const reorderData = asRecord(reorderPayload.data);
  const reorderResult = asRecord(reorderPayload.result);
  const reorderOrder = asRecord(reorderPayload.order);
  const details = asRecord(
    root.details ?? data.details ?? result.details ?? nestedOrder.details
  );
  const reorderDetails = asRecord(
    reorderPayload.details ?? reorderData.details ?? reorderResult.details ?? reorderOrder.details
  );
  const source = {
    ...root,
    ...data,
    ...result,
    ...nestedOrder,
    ...reorderData,
    ...reorderResult,
    ...reorderOrder,
    details: { ...reorderDetails, ...details },
    reorder_payload: reorderPayload,
  };
  const categoryRaw =
    firstString(source, ["category", "details.category", "reorder_payload.category"])?.toLowerCase() ?? "";
  const isFlight = categoryRaw.includes("flight") || categoryRaw.includes("air");
  const isParcel = categoryRaw.includes("parcel") || categoryRaw.includes("delivery");

  if (isFlight) return buildFlightReorderMessage(source) ?? REORDER_CHAT_MESSAGE_FLIGHT;
  if (isParcel) return buildParcelReorderMessage(source) ?? REORDER_CHAT_MESSAGE_PARCEL;

  return buildFlightReorderMessage(source) ?? buildParcelReorderMessage(source) ?? REORDER_CHAT_MESSAGE;
}

export function savePendingReorderFlow(order: unknown, message?: string): void {
  if (typeof window === "undefined") return;

  const resolvedMessage =
    typeof message === "string" && message.trim()
      ? message.trim()
      : buildReorderMessage(order);

  const payload: PendingReorderFlow = {
    createdAt: Date.now(),
    message: resolvedMessage,
    order,
  };

  try {
    window.sessionStorage.setItem(REORDER_FLOW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

export function consumePendingReorderFlow(): PendingReorderFlow | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(REORDER_FLOW_STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(REORDER_FLOW_STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw) as Partial<PendingReorderFlow>;
    return {
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      message: typeof parsed.message === "string" && parsed.message.trim() ? parsed.message : REORDER_CHAT_MESSAGE,
      order: parsed.order,
    };
  } catch {
    return null;
  }
}
