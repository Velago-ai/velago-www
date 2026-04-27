export const REORDER_CHAT_MESSAGE = "Vela please reorder this booking with new dates.";

const REORDER_FLOW_STORAGE_KEY = "velago_reorder_flow";

export interface PendingReorderFlow {
  createdAt: number;
  message: string;
  order: unknown;
}

export function savePendingReorderFlow(order: unknown, message = REORDER_CHAT_MESSAGE): void {
  if (typeof window === "undefined") return;

  const payload: PendingReorderFlow = {
    createdAt: Date.now(),
    message: message.trim() || REORDER_CHAT_MESSAGE,
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
