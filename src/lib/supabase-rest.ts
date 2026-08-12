const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://awkjmzrjfdjvlmdbtnzy.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_uePDZxIp9x1uTbuqCPhc9A_z0CdpdtC";
const SESSION_KEY = "little-reds-supabase-session";

export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: { display_name?: string };
};
export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
};
export type Entitlement = {
  trial_started_at: string;
  trial_ends_at: string;
  trial_active: boolean;
  membership_active: boolean;
  unlimited: boolean;
  buddy_unleashed: boolean;
};

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "msg" in body
        ? String((body as { msg?: unknown }).msg)
        : `Supabase request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function getStoredSession(): SupabaseSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as SupabaseSession | null;
    return value?.access_token && value?.refresh_token && value?.user?.id ? value : null;
  } catch {
    return null;
  }
}
function storeSession(session: SupabaseSession | null) {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export async function adoptSessionFromAuthHash(): Promise<SupabaseSession | null> {
  if (typeof window === "undefined" || !location.hash.includes("access_token=")) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  const user = await request<SupabaseUser>("/auth/v1/user", {}, access_token);
  const session: SupabaseSession = {
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600),
    user,
  };
  storeSession(session);
  history.replaceState({}, document.title, location.pathname + location.search);
  return session;
}

export async function signUp(email: string, password: string, displayName: string) {
  const result = await request<SupabaseSession | { user: SupabaseUser }>("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      data: { display_name: displayName },
      redirect_to: `${location.origin}${import.meta.env.BASE_URL}`,
    }),
  });
  if ("access_token" in result && result.access_token) storeSession(result);
  return result;
}
export async function signIn(email: string, password: string) {
  const result = await request<SupabaseSession>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  storeSession(result);
  return result;
}
export async function refreshSession() {
  const current = getStoredSession();
  if (!current?.refresh_token) return null;
  try {
    const result = await request<SupabaseSession>("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    storeSession(result);
    return result;
  } catch {
    storeSession(null);
    return null;
  }
}
export async function signOut() {
  const current = getStoredSession();
  try {
    if (current?.access_token)
      await request("/auth/v1/logout", { method: "POST" }, current.access_token);
  } finally {
    storeSession(null);
  }
}
export async function sendPasswordReset(email: string) {
  await request("/auth/v1/recover", {
    method: "POST",
    body: JSON.stringify({
      email,
      redirect_to: `${location.origin}${import.meta.env.BASE_URL}auth`,
    }),
  });
}
export async function updatePassword(password: string) {
  const current = getStoredSession();
  if (!current?.access_token) throw new Error("Your recovery session has expired.");
  return request<SupabaseUser>(
    "/auth/v1/user",
    { method: "PUT", body: JSON.stringify({ password }) },
    current.access_token,
  );
}
export async function getProfile(userId: string, token: string) {
  const result = await request<Array<Record<string, unknown>>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,handle,display_name,about,avatar_url,banner_url,trial_started_at`,
    {},
    token,
  );
  return result[0] || null;
}
export async function updateProfile(
  userId: string,
  values: Record<string, unknown>,
  token: string,
) {
  const result = await request<Array<Record<string, unknown>>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(values) },
    token,
  );
  return result[0] || null;
}
export async function getEntitlement(token: string) {
  return request<Entitlement | null>(
    "/rest/v1/rpc/get_entitlement",
    { method: "POST", body: "{}" },
    token,
  );
}
