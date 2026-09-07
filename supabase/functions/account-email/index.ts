import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const EVENT_TYPES = new Set(["welcome", "membership_unlimited", "milestone", "birthday"]);

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function authToken(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function htmlFor(eventType: string, displayName: string, payload: Record<string, unknown>) {
  const safeName = displayName || "Creator";
  switch (eventType) {
    case "membership_unlimited":
      return {
        subject: "Unlimited Little Red’s Big Studio is yours",
        html: `<p>Hi ${safeName},</p><p>Your unlimited Little Red’s Big Studio membership is active. Buddy Unleashed is available to you for the paid membership period.</p><p>Keep creating.</p>`,
      };
    case "milestone":
      return {
        subject: `Happy creator milestone — ${String(payload.months ?? "")} months`,
        html: `<p>Hi ${safeName},</p><p>You’ve been creating with Little Red’s Big Studio for ${String(payload.months ?? "")} months. That’s worth celebrating.</p><p>Keep creating.</p>`,
      };
    case "birthday":
      return {
        subject: "Happy birthday from Little Red’s Big Studio",
        html: `<p>Happy birthday, ${safeName}.</p><p>Wishing you a brilliant creative year ahead.</p>`,
      };
    default:
      return {
        subject: "Welcome to Little Red’s Big Studio",
        html: `<p>Welcome, ${safeName}.</p><p>Your Studio account is ready. Buddy is here, your creative work is yours, and your seven-day trial begins with your first successful login.</p><p>Keep creating.</p>`,
      };
  }
}

async function sendOne(
  supabase: ReturnType<typeof createClient>,
  event: Record<string, unknown>,
  email: string,
) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("EMAIL_FROM")?.trim();
  if (!apiKey || !from) return { sent: false, skipped: "email_provider_not_configured" };

  const eventType = String(event.event_type ?? "");
  if (!EVENT_TYPES.has(eventType)) return { sent: false, skipped: "unsupported_event" };

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const template = htmlFor(eventType, String(payload.display_name ?? "Creator"), payload);
  const idempotencyKey = String(event.idempotency_key ?? "");
  if (!idempotencyKey) return { sent: false, skipped: "missing_idempotency_key" };

  const resend = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from, to: [email], subject: template.subject, html: template.html }),
  });

  if (!resend.ok) {
    const detail = (await resend.text()).slice(0, 1000);
    await supabase
      .from("email_events")
      .update({ status: "failed", last_error: detail, updated_at: new Date().toISOString() })
      .eq("id", event.id);
    return { sent: false, failed: true };
  }

  await supabase
    .from("email_events")
    .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("id", event.id);
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response(200, { ok: true, service: "account-email" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cronSecret = Deno.env.get("EMAIL_CRON_SECRET")?.trim();
  const suppliedCronSecret = req.headers.get("x-email-cron-secret")?.trim();
  const isCron = Boolean(cronSecret && suppliedCronSecret && cronSecret === suppliedCronSecret);

  let userId = "";
  let email = "";
  if (!isCron) {
    const token = authToken(req);
    if (!token) return response(401, { error: "Authentication required" });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return response(401, { error: "Invalid session" });
    userId = data.user.id;
    email = (data.user.email ?? "").trim().toLowerCase();
    if (!email) return response(422, { error: "Account email unavailable" });
  } else {
    await supabase.rpc("queue_due_lifecycle_emails");
  }

  let eventsQuery = supabase
    .from("email_events")
    .select("id,user_id,event_type,idempotency_key,payload,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(isCron ? 20 : 5);
  if (userId) eventsQuery = eventsQuery.eq("user_id", userId);

  const { data: events, error: eventError } = await eventsQuery;
  if (eventError) return response(500, { error: "Unable to load email events" });
  if (!events?.length) return response(200, { ok: true, sent: 0 });

  if (isCron) {
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const byId = new Map((users?.users ?? []).map((user) => [user.id, (user.email ?? "").trim().toLowerCase()]));
    let sent = 0;
    for (const event of events) {
      const target = byId.get(event.user_id);
      if (!target) continue;
      const result = await sendOne(supabase, event, target);
      if (result.sent) sent += 1;
    }
    return response(200, { ok: true, sent });
  }

  let sent = 0;
  for (const event of events) {
    const result = await sendOne(supabase, event, email);
    if (result.sent) sent += 1;
  }
  return response(200, { ok: true, sent });
});
