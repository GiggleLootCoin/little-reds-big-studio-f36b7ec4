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
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_active: boolean;
  membership_active: boolean;
  unlimited: boolean;
  buddy_unleashed: boolean;
};
export type ProfileRecord = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  handle?: string;
  bio?: string;
  banner_url?: string | null;
  website_url?: string | null;
  station_name?: string | null;
  is_public?: boolean;
  trial_started_at?: string | null;
  date_of_birth?: string | null;
  timezone?: string;
  birthday_emails_enabled?: boolean;
  marketing_email_opt_in?: boolean;
  created_at?: string;
  updated_at?: string;
};
export type StationItem = {
  id: string;
  user_id: string;
  kind: "music" | "video" | "artwork" | "beat" | "other";
  title: string;
  description: string;
  asset_url: string;
  thumbnail_url: string | null;
  visibility: "public" | "private";
  published_at: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};
export type PublicStation = {
  profile: ProfileRecord;
  items: StationItem[];
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

async function markSuccessfulLogin(accessToken: string) {
  await request<string>(
    "/rest/v1/rpc/start_trial_on_successful_login",
    { method: "POST", body: "{}" },
    accessToken,
  );
}

async function deliverPendingAccountEmail(accessToken: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/account-email`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch {
    // Email delivery is deliberately non-blocking for authentication.
  }
}

async function finishSuccessfulLogin(accessToken: string) {
  await markSuccessfulLogin(accessToken);
  await deliverPendingAccountEmail(accessToken);
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
  await finishSuccessfulLogin(access_token);
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
  if ("access_token" in result && result.access_token) {
    storeSession(result);
    await finishSuccessfulLogin(result.access_token);
  }
  return result;
}
export async function signIn(email: string, password: string) {
  const result = await request<SupabaseSession>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  storeSession(result);
  await finishSuccessfulLogin(result.access_token);
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
const PROFILE_SELECT =
  "id,display_name,avatar_url,handle,bio,banner_url,website_url,station_name,is_public,trial_started_at,date_of_birth,timezone,birthday_emails_enabled,marketing_email_opt_in,created_at,updated_at";
export async function getProfile(userId: string, token: string): Promise<ProfileRecord | null> {
  const result = await request<ProfileRecord[]>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${PROFILE_SELECT}`,
    {},
    token,
  );
  return result[0] || null;
}
export async function updateProfile(
  userId: string,
  values: Partial<
    Pick<
      ProfileRecord,
      | "display_name"
      | "avatar_url"
      | "handle"
      | "bio"
      | "banner_url"
      | "website_url"
      | "station_name"
      | "is_public"
      | "date_of_birth"
      | "timezone"
      | "birthday_emails_enabled"
      | "marketing_email_opt_in"
    >
  >,
  token: string,
) {
  const result = await request<ProfileRecord[]>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(values) },
    token,
  );
  return result[0] || null;
}
export async function getPublicStation(handle: string): Promise<PublicStation | null> {
  const profile = await request<ProfileRecord[]>(
    `/rest/v1/profiles?handle=eq.${encodeURIComponent(handle.toLowerCase())}&is_public=eq.true&select=${PROFILE_SELECT}`,
  );
  const creator = profile[0];
  if (!creator) return null;
  const items = await request<StationItem[]>(
    `/rest/v1/station_items?user_id=eq.${encodeURIComponent(creator.id)}&visibility=eq.public&order=sort_order.asc,published_at.desc&select=*`,
  );
  return { profile: creator, items };
}
export async function getMyStationItems(token: string, userId: string): Promise<StationItem[]> {
  return request<StationItem[]>(
    `/rest/v1/station_items?user_id=eq.${encodeURIComponent(userId)}&order=sort_order.asc,created_at.desc&select=*`,
    {},
    token,
  );
}
export async function publishStationItem(
  token: string,
  item: Pick<
    StationItem,
    "kind" | "title" | "description" | "asset_url" | "thumbnail_url" | "metadata"
  > & {
    user_id: string;
  },
): Promise<StationItem> {
  if (!item.asset_url.trim()) throw new Error("A real artifact URL is required before publishing.");
  const result = await request<StationItem[]>(
    "/rest/v1/station_items",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...item,
        visibility: "public",
        published_at: new Date().toISOString(),
      }),
    },
    token,
  );
  if (!result[0]) throw new Error("The Station did not confirm publication.");
  return result[0];
}
export async function deleteStationItem(token: string, itemId: string): Promise<void> {
  await request(
    `/rest/v1/station_items?id=eq.${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
    token,
  );
}
export async function getEntitlement(token: string) {
  return request<Entitlement | null>(
    "/rest/v1/rpc/get_entitlement",
    { method: "POST", body: "{}" },
    token,
  );
}
