import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./auth";
import { userStore } from "./user-store";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.velago.ai";

let refreshPromise: Promise<string> | null = null;

async function tryRefresh(): Promise<string> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const rt = getRefreshToken();
    const at = getAccessToken();
    if (!rt || !at) throw new Error("No refresh token");
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${at}` },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) throw new Error("Refresh failed");
    const data = (await res.json()) as TokenResponse;
    setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function forceLogout() {
  clearTokens();
  userStore.set(null);
  window.location.href = "/auth";
}

async function apiRequest<T>(method: string, path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body != null ? JSON.stringify(body) : undefined });

  if (res.status === 401 && token) {
    // Refresh is temporarily disabled. Uncomment the block below to restore auto-refresh.
    /*
    // Try refresh once
    try {
      const newToken = await tryRefresh();
      const retry = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${newToken}` },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(err.detail ?? "Request failed");
      }
      return retry.json() as Promise<T>;
    } catch {
      forceLogout();
      throw new Error("Session expired");
    }
    */
    forceLogout();
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  return apiRequest("POST", path, body, token);
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface MessageResponse {
  message: string;
}

export interface UserProfile {
  name?: string;
  given_name?: string;
  family_name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  phone?: string;
  phone_number?: string;
  plan?: string;
  saved_addresses?: Record<string, unknown>;
}

export function register(email: string, password: string): Promise<MessageResponse> {
  return apiPost("/auth/register", { email, password });
}

export function confirmEmail(email: string, confirmation_code: string): Promise<MessageResponse> {
  return apiPost("/auth/confirm", { email, confirmation_code });
}

export function login(email: string, password: string): Promise<TokenResponse> {
  return apiPost("/auth/login", { email, password });
}

export function requestResetCode(email: string): Promise<MessageResponse> {
  return apiPost("/auth/reset", { email });
}

export function confirmReset(email: string, confirmation_code: string, new_password: string): Promise<MessageResponse> {
  return apiPost("/auth/reset", { email, confirmation_code, new_password });
}

export function signOut(token: string): Promise<MessageResponse> {
  return apiPost("/auth/logout", {}, token);
}

export function fetchMe(token: string): Promise<UserProfile> {
  return apiRequest("GET", "/auth/me", null, token);
}

export interface UpdateProfile {
  email?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  phone?: string;
  plan?: string;
  is_active?: boolean;
  saved_addresses?: Record<string, unknown>;
}

export function updateMe(token: string, data: UpdateProfile): Promise<UserProfile> {
  return apiRequest("PATCH", "/auth/me", data, token);
}

export interface ListOrdersParams {
  category?: string;
  page?: number;
  per_page?: number;
}

export interface OrderListItem {
  id?: string;
  order_id?: string;
  meshhub_order_id?: string;
  supplier_order_id?: string;
  category?: string;
  status?: string;
  price?: number | string;
  currency?: string;
  provider?: string;
  supplier?: string;
  service?: string;
  service_name?: string;
  created_at?: string;
  expires_at?: string;
  [key: string]: unknown;
}

export interface OrdersPageResponse {
  items?: OrderListItem[];
  results?: OrderListItem[];
  data?: OrderListItem[];
  total?: number;
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

export function listOrders(token: string, params: ListOrdersParams = {}): Promise<OrdersPageResponse> {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return apiRequest("GET", `/orders${qs ? `?${qs}` : ""}`, null, token);
}

export interface ReorderResponse {
  [key: string]: unknown;
}

export function reorderOrder(token: string, orderId: string): Promise<ReorderResponse> {
  return apiPost("/orders/reorder", { order_id: orderId }, token);
}

export type ChatTranscriptLine = {
  role: string;
  text: string;
};

export type ChatHistoryResponse = {
  session_id: string;
  user_id: string;
  subject: string | null;
  status: string | null;
  session_started_at: number | null;
  session_ended_at: number | null;
  transcript: ChatTranscriptLine[];
};

export async function fetchChatHistory(token: string): Promise<ChatHistoryResponse | null> {
  try {
    return await apiRequest<ChatHistoryResponse>("GET", "/services/chat_history", null, token);
  } catch (err) {
    const message = (err as Error)?.message ?? "";
    if (/chat history not found|not found/i.test(message)) return null;
    throw err;
  }
}
