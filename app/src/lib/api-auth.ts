const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.velago.ai";

async function apiRequest<T>(method: string, path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

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

export function signOut(token: string): Promise<MessageResponse> {
  return apiPost("/auth/logout", {}, token);
}

export async function fetchMe(token: string): Promise<UserProfile> {
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json() as Promise<UserProfile>;
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
