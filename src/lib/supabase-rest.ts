const SUPABASE_URL = "https://awkjmzrjfdjvlmdbtnzy.supabase.co";
const SUPABASE_KEY = "sb_publishable_uePDZxIp9x1uTbuqCPhc9A_z0CdpdtC";
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
  trial_started_at: string | null;
  trial_ends_at: string | null;
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
        : body && typeof body === "object" && "message" in body
          ? String((body as { message?: unknown }).message)
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

export async function adoptSessionFromAuthHash() {
  if (typeof window === "undefined" || !window.location.hash.includes("access_token=")) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  const user = await request<SupabaseUser>("/auth/v1/user", { method: "GET" }, accessToken);
  const expiresIn = Number(params.get("expires_in") || 3600);
  const session: SupabaseSession = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user,
  };
  storeSession(session);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  return session;
}

export async function signUp(email: string, password: string, displayName: string) {
  const result = await request<SupabaseSession | { user: SupabaseUser }>("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      data: { display_name: displayName },
      redirect_to: `${window.location.origin}${import.meta.env.BASE_URL}`,
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
    if (current?.access_token) {
      await request("/auth/v1/logout", { method: "POST" }, current.access_token);
    }
  } finally {
    storeSession(null);
  }
}

export async function sendPasswordReset(email: string) {
  await request("/auth/v1/recover", {
    method: "POST",
    body: JSON.stringify({
      email,
      redirect_to: `${window.location.origin}${import.meta.env.BASE_URL}auth`,
    }),
  });
}

export async function updatePassword(password: string) {
  const current = getStoredSession();
  if (!current?.access_token) throw new Error("Your recovery session has expired. Request another reset email.");
  return request<SupabaseUser>(
    "/auth/v1/user",
    { method: "PUT", body: JSON.stringify({ password }) },
    current.access_token,
  );
}

export async function getProfile(userId: string, accessToken: string) {
  const rows = await request<Array<Record<string, unknown>>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,handle,display_name,about,avatar_url,banner_url,trial_started_at`,
    { method: "GET" },
    accessToken,
  );
  return rows[0] || null;
}

export async function updateProfile(userId: string, values: Record<string, unknown>, accessToken: string) {
  const rows = await request<Array<Record<string, unknown>>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(values),
    },
    accessToken,
  );
  return rows[0] || null;
}

export async function getEntitlement(accessToken: string): Promise<Entitlement | null> {
  return request<Entitlement | null>(
    "/rest/v1/rpc/get_entitlement",
    { method: "POST", body: "{}" },
    accessToken,
  );
}
