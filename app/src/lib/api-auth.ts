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
