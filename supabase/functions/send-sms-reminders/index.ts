// supabase/functions/send-sms-reminders/index.ts
// Triggered by pg_cron every 15 minutes.
//
// Now sends EMAIL, not SMS — students get reminders at the address they signed
// in with, so there's no phone number to collect and no DLT/country routing to
// maintain. The function name is kept as-is so the existing pg_cron schedule
// and deployed URL keep working without a migration.
//
// Required secrets (set with `supabase secrets set ...`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — already set for this project
//   RESEND_API_KEY  (resend.com)  OR  BREVO_API_KEY  (brevo.com)
//   EMAIL_FROM      optional, e.g. "AcadSphere <alerts@yourdomain.com>"
//
// Schedule: 12h / 6h / 1h before the due date, plus a daily nudge while a
// submission is still pending past its deadline (up to 14 days).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "AcadSphere <onboarding@resend.dev>";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function parseFrom(): { name: string; email: string } {
  const m = EMAIL_FROM.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1] || "AcadSphere", email: m[2] } : { name: "AcadSphere", email: EMAIL_FROM };
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderEmail(heading: string, intro: string, rows: Array<[string, string]>, callout: string, tone: "warn" | "bad"): { html: string; text: string } {
  const color = tone === "bad" ? "#B3232C" : "#B45309";
  const bg = tone === "bad" ? "#FDF2F2" : "#FFFBEB";
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #E7E3DA;">
           <span style="color:#6B6A66;font-size:14px;">${escapeHtml(label)}</span>
           <span style="color:#0A0A0A;font-size:14px;font-weight:600;">${escapeHtml(value)}</span>
         </div>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E3DA;border-radius:16px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #E7E3DA;">
      <span style="font-size:18px;font-weight:800;color:#0A0A0A;">Acad<span style="color:#B3232C;">Sphere</span></span>
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#0A0A0A;">${escapeHtml(heading)}</h1>
      <p style="margin:0;color:#4A4945;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>
      <div style="margin-top:20px;">${rowsHtml}</div>
      <div style="margin-top:20px;padding:12px 14px;border-radius:10px;background:${bg};border:1px solid ${color}33;color:${color};font-size:14px;font-weight:600;">${escapeHtml(callout)}</div>
    </div>
    <div style="padding:16px 24px;background:#F7F5F0;border-top:1px solid #E7E3DA;color:#8A8985;font-size:12px;">
      You're receiving this because assignment reminders are enabled on your AcadSphere profile.
    </div>
  </div></body></html>`;

  const text = [heading, "", intro, "", ...rows.map(([l, v]) => `${l}: ${v}`), "", callout].join("\n");
  return { html, text };
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const from = parseFrom();

  if (RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [to], subject, html, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return;
  }

  if (BREVO_API_KEY) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: from.name, email: from.email },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return;
  }

  throw new Error("No email provider configured — set RESEND_API_KEY or BREVO_API_KEY.");
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// The tightest unsent window wins, so a task picked up late fires one email
// rather than three back to back. notified_24h is reused as the "first
// reminder sent" flag (now at 12h) to avoid a schema migration.
const WINDOWS: Array<{ hours: number; flag: "notified_24h" | "notified_6h" | "notified_1h" }> = [
  { hours: 12, flag: "notified_24h" },
  { hours: 6, flag: "notified_6h" },
  { hours: 1, flag: "notified_1h" },
];

Deno.serve(async () => {
  const now = new Date();

  const { data: tasks, error } = await supabase
    .from("classroom_tasks")
    .select("id, user_id, title, course_name, due_date, notified_24h, notified_6h, notified_1h, last_overdue_notice")
    .eq("status", "PENDING")
    .not("due_date", "is", null);

  if (error) {
    console.error("DB fetch error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!tasks || tasks.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // Resolve recipients once per user, skipping anyone who opted out.
  const userIds: string[] = Array.from(new Set(tasks.map((t: any) => String(t.user_id))));
  const optedOut = new Set<string>();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, sms_notifications_enabled")
    .in("id", userIds);
  for (const p of profiles || []) {
    if ((p as any).sms_notifications_enabled === false) optedOut.add((p as any).id);
  }

  const emails = new Map<string, string>();
  await Promise.all(
    userIds
      .filter((id) => !optedOut.has(id))
      .map(async (id) => {
        try {
          const { data } = await supabase.auth.admin.getUserById(id);
          if (data?.user?.email) emails.set(id, data.user.email);
        } catch (e) {
          console.error("email lookup failed", id, e);
        }
      }),
  );

  const fmt = (d: Date) =>
    d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  let sent = 0;
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const task of tasks as any[]) {
    const to = emails.get(String(task.user_id));
    if (!to) continue;

    const due = new Date(task.due_date);
    const hoursLeft = (due.getTime() - now.getTime()) / HOUR;
    const subjectName = task.course_name || "your course";
    const patch: Record<string, unknown> = {};

    const win = WINDOWS.find((w) => hoursLeft > 0 && hoursLeft <= w.hours && !task[w.flag]);
    if (win) {
      const remaining = hoursLeft < 1 ? "under an hour" : `about ${Math.ceil(hoursLeft)} hours`;
      const { html, text } = renderEmail(
        `Due in ${remaining}: ${task.title}`,
        `Your submission for ${subjectName} is still pending, and the deadline is ${remaining} away.`,
        [["Assignment", task.title], ["Subject", subjectName], ["Due", fmt(due)]],
        win.hours === 1 ? "Final reminder — submit now." : "Submit before the deadline to stay on track.",
        win.hours === 1 ? "bad" : "warn",
      );
      try {
        await sendEmail(to, `Due in ${remaining}: ${task.title}`, html, text);
        patch[win.flag] = true;
        sent++;
      } catch (e) {
        console.error("send failed", task.id, e);
      }
    }

    if (hoursLeft < 0) {
      const daysOverdue = Math.abs(hoursLeft) / 24;
      const last = task.last_overdue_notice ? new Date(task.last_overdue_notice) : null;
      if (daysOverdue <= 14 && (!last || now.getTime() - last.getTime() >= DAY)) {
        const days = Math.max(1, Math.ceil(daysOverdue));
        const { html, text } = renderEmail(
          `Overdue: ${task.title}`,
          `This submission for ${subjectName} is ${days} day${days > 1 ? "s" : ""} past its deadline and still shows as pending.`,
          [["Assignment", task.title], ["Subject", subjectName], ["Days overdue", String(days)]],
          "Submit as soon as possible, or check with your faculty about late submission.",
          "bad",
        );
        try {
          await sendEmail(to, `Overdue: ${task.title}`, html, text);
          patch.last_overdue_notice = now.toISOString();
          sent++;
        } catch (e) {
          console.error("overdue send failed", task.id, e);
        }
      }
    }

    if (Object.keys(patch).length > 0) updates.push({ id: task.id, patch });
  }

  // Flags are written only after a successful send, so a delivery failure
  // retries on the next run instead of being silently swallowed.
  await Promise.allSettled(
    updates.map(({ id, patch }) => supabase.from("classroom_tasks").update(patch).eq("id", id)),
  );

  console.log(`Reminder cron: ${sent} email(s) sent, ${updates.length} row(s) updated.`);
  return new Response(JSON.stringify({ sent, updated: updates.length }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
