import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function template(eventType: string, payload: Record<string, unknown>) {
  const name = escapeHtml(String(payload.display_name ?? "Creator"));
  const months = escapeHtml(String(payload.months ?? ""));
  switch (eventType) {
    case "membership_unlimited":
      return { subject: "Unlimited Little Red’s Big Studio is yours", html: `<p>Hi ${name},</p><p>Your unlimited Little Red’s Big Studio membership is active. Buddy Unleashed is available to you for the paid membership period.</p><p>Keep creating.</p>` };
    case "milestone":
      return { subject: `Happy creator milestone — ${months} months`, html: `<p>Hi ${name},</p><p>You’ve been creating with Little Red’s Big Studio for ${months} months. That’s worth celebrating.</p><p>Keep creating.</p>` };
    case "birthday":
      return { subject: "Happy birthday from Little Red’s Big Studio", html: `<p>Happy birthday, ${name}.</p><p>Wishing you a brilliant creative year ahead.</p>` };
    default:
      return { subject: "Welcome to Little Red’s Big Studio", html: `<p>Welcome, ${name}.</p><p>Your Studio account is ready. Buddy is here, your creative work is yours, and your seven-day trial begins with your first successful login.</p><p>Keep creating.</p>` };
  }
}

async function sendOne(supabase: ReturnType<typeof createClient>, event: Record<string, unknown>, email: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("EMAIL_FROM")?.trim();
  if (!apiKey || !from) return { sent: false, skipped: "email_provider_not_configured" };
  const idempotencyKey = String(event.idempotency_key ?? "");
  if (!idempotencyKey) return { sent: false, skipped: "missing_idempotency_key" };
  const message = template(String(event.event_type ?? ""), (event.payload ?? {}) as Record<string, unknown>);
  const resend = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ from, to: [email], subject: message.subject, html: message.html }) });
  if (!resend.ok) {
    const detail = (await resend.text()).slice(0, 1000);
    await supabase.from("email_events").update({ status: "failed", last_error: detail, updated_at: new Date().toISOString() }).eq("id", event.id);
    return { sent: false, failed: true };
  }
  await supabase.from("email_events").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", event.id);
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response(200, { ok: true, service: "account-email-cron" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const supplied = req.headers.get("x-email-cron-secret")?.trim();
  if (!supplied) return response(401, { error: "Cron authentication required" });
  const { data: expected } = await supabase.rpc("get_email_cron_secret");
  if (!expected || supplied !== expected) return response(401, { error: "Invalid cron secret" });
  const { error: queueError } = await supabase.rpc("queue_due_lifecycle_emails");
  if (queueError) return response(500, { error: "Unable to queue lifecycle emails" });
  const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byId = new Map((users?.users ?? []).map((user) => [user.id, (user.email ?? "").trim().toLowerCase()]));
  const { data: events, error: eventError } = await supabase.from("email_events").select("id,user_id,event_type,idempotency_key,payload,status,created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(50);
  if (eventError) return response(500, { error: "Unable to load email events" });
  let sent = 0;
  for (const event of events ?? []) {
    const email = byId.get(event.user_id);
    if (!email) continue;
    const result = await sendOne(supabase, event, email);
    if (result.sent) sent += 1;
  }
  return response(200, { ok: true, queued: events?.length ?? 0, sent });
});
