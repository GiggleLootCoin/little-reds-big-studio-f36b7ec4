import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };
const MEMBERSHIP_EVENTS = new Set([
  "membership.started",
  "membership.updated",
  "membership.cancelled",
  "membership.paused",
]);

async function hmac(raw: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function out(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function isUnlimitedMembership(data: Record<string, unknown>) {
  const duration = String(data.duration_type ?? "").trim().toLowerCase();
  const currency = String(data.currency ?? "").trim().toUpperCase();
  const amount = Number(data.amount);
  return duration === "month" && currency === "USD" && Number.isFinite(amount) && amount === 10;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return out(200, { ok: true, endpoint: "buymeacoffee-webhook" });

  const raw = await req.text();
  const secret = Deno.env.get("BMAC_WEBHOOK_SECRET");
  if (!secret) return out(503, { error: "Webhook secret not configured" });

  const signature = req.headers.get("x-signature-sha256") ?? "";
  if (!safeEqual(await hmac(raw, secret), signature)) return out(401, { error: "Invalid signature" });

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return out(400, { error: "Invalid JSON" });
  }

  if (event.live_mode !== true) return out(200, { ok: true, ignored: "test_event" });

  const type = String(event.type ?? "");
  if (!MEMBERSHIP_EVENTS.has(type)) return out(200, { ok: true, ignored: type });

  const data = (event.data ?? {}) as Record<string, unknown>;
  const eventId = String(event.event_id ?? "");
  const email = String(data.supporter_email ?? "").trim().toLowerCase();
  if (!eventId) return out(400, { error: "event_id missing" });
  if (!email) return out(422, { error: "supporter_email missing" });
  if (!isUnlimitedMembership(data)) return out(200, { ok: true, ignored: "non_unlimited_membership" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error: logError } = await supabase.from("bmac_webhook_events").insert({
    event_id: eventId,
    event_type: type,
    payload: event,
  });

  if (logError && logError.code !== "23505") throw logError;
  if (logError?.code === "23505") return out(200, { ok: true, duplicate: true });

  const periodEndRaw = data.current_period_end;
  const periodEnd = Number.isFinite(Number(periodEndRaw))
    ? new Date(Number(periodEndRaw) * 1000).toISOString()
    : String(periodEndRaw ?? "");
  const providerMemberId = String(data.psp_id ?? data.id ?? "").trim();
  if (!providerMemberId) return out(422, { error: "membership id missing" });
  if (!periodEnd) return out(422, { error: "current_period_end missing" });

  const status =
    type === "membership.cancelled"
      ? "cancelled"
      : type === "membership.paused"
        ? "paused"
        : "active";

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersError) throw usersError;

  const user = users.users.find(
    (u) => (u.email ?? "").trim().toLowerCase() === email,
  );

  if (!user) {
    return out(200, { ok: true, pending_account_match: true });
  }

  const { error: membershipError } = await supabase.from("memberships").upsert(
    {
      user_id: user.id,
      provider: "buymeacoffee",
      provider_member_id: providerMemberId,
      status,
      tier: "unlimited",
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,provider_member_id" },
  );

  if (membershipError) throw membershipError;

  return out(200, {
    ok: true,
    status,
    tier: "unlimited",
    current_period_end: periodEnd,
  });
});
