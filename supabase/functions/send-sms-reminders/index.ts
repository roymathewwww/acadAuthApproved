// supabase/functions/send-sms-reminders/index.ts
// Triggered by pg_cron every 15 minutes.
// Uses raw fetch() to the Fast2SMS REST API — no heavy SDK needed in Deno/Edge.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FAST2SMS_API_KEY  = Deno.env.get("FAST2SMS_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Fast2SMS "Quick SMS" helper ─────────────────────────────────────────────
// DLT-exempt route for low-volume custom-text alerts — expects a bare
// 10-digit Indian mobile number (no "+91" / country code).
async function sendSms(to: string, body: string): Promise<void> {
  const digits = to.replace(/\D/g, "");
  const number = digits.length > 10 ? digits.slice(-10) : digits;
  if (number.length !== 10) {
    throw new Error(`Fast2SMS: "${to}" is not a valid 10-digit Indian mobile number`);
  }

  const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: FAST2SMS_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      route: "q",
      message: body,
      language: "english",
      flash: "0",
      numbers: number,
    }).toString(),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.return !== true) {
    throw new Error(`Fast2SMS ${res.status}: ${JSON.stringify(json)}`);
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────────
const HOUR = 60 * 60 * 1000;
const DAY  = 24 * HOUR;

function hoursUntil(due: Date, now: Date): number {
  return (due.getTime() - now.getTime()) / HOUR;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async () => {
  const now = new Date();

  // 1. Fetch all PENDING tasks joined with phone_number from profiles
  const { data: tasks, error } = await supabase
    .from("classroom_tasks")
    .select(`
      id,
      user_id,
      title,
      course_name,
      due_date,
      notified_24h,
      notified_6h,
      notified_1h,
      last_overdue_notice,
      profiles!inner(phone_number, sms_notifications_enabled)
    `)
    .eq("status", "PENDING")
    .not("profiles.phone_number", "is", null)
    .eq("profiles.sms_notifications_enabled", true);

  if (error) {
    console.error("DB fetch error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // 2. Build SMS jobs and DB updates concurrently
  const smsJobs:   Promise<void>[]                     = [];
  const dbUpdates: { id: string; patch: Record<string, unknown> }[] = [];

  for (const task of tasks) {
    const profile = (task as any).profiles;
    const phone: string = profile?.phone_number;
    if (!phone) continue;

    // Tasks without a due date cannot be timed — skip
    if (!task.due_date) continue;

    const due   = new Date(task.due_date);
    const diff  = hoursUntil(due, now); // negative = past due
    const patch: Record<string, unknown> = {};

    // ── Pre-due notifications ─────────────────────────────────────────────────

    // 24h reminder
    if (!task.notified_24h && diff > 0 && diff <= 24) {
      const msg = `📚 AcadSphere Reminder: "${task.title}" (${task.course_name}) is due in ~${Math.ceil(diff)}h. Don't miss it!`;
      smsJobs.push(sendSms(phone, msg).catch(console.error));
      patch.notified_24h = true;
    }

    // 6h reminder
    if (!task.notified_6h && diff > 0 && diff <= 6) {
      const msg = `⏰ AcadSphere: "${task.title}" is due in ~${Math.ceil(diff)}h. Submit soon!`;
      smsJobs.push(sendSms(phone, msg).catch(console.error));
      patch.notified_6h = true;
    }

    // 1h reminder
    if (!task.notified_1h && diff > 0 && diff <= 1) {
      const msg = `🚨 FINAL REMINDER: "${task.title}" is due in under 1 hour! Submit now.`;
      smsJobs.push(sendSms(phone, msg).catch(console.error));
      patch.notified_1h = true;
    }

    // ── Overdue daily notifications ───────────────────────────────────────────
    if (diff < 0) {
      const daysOverdue = Math.abs(diff) / 24;

      // Stop after 14 days past due (business logic cutoff)
      if (daysOverdue <= 14) {
        const lastNotice = task.last_overdue_notice
          ? new Date(task.last_overdue_notice)
          : null;
        const shouldSend =
          !lastNotice || now.getTime() - lastNotice.getTime() >= DAY;

        if (shouldSend) {
          const daysText = Math.ceil(daysOverdue);
          const msg = `⚠️ AcadSphere: "${task.title}" (${task.course_name}) is ${daysText} day${daysText > 1 ? "s" : ""} overdue. Please submit as soon as possible.`;
          smsJobs.push(sendSms(phone, msg).catch(console.error));
          patch.last_overdue_notice = now.toISOString();
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      dbUpdates.push({ id: task.id, patch });
    }
  }

  // 3. Fire all SMS concurrently
  await Promise.allSettled(smsJobs);

  // 4. Write DB flag updates concurrently to prevent duplicate sends on next cron run
  await Promise.allSettled(
    dbUpdates.map(({ id, patch }) =>
      supabase.from("classroom_tasks").update(patch).eq("id", id)
    )
  );

  console.log(`SMS cron ran: ${smsJobs.length} message(s) queued, ${dbUpdates.length} row(s) updated.`);

  return new Response(
    JSON.stringify({ sent: smsJobs.length, updated: dbUpdates.length }),
    { headers: { "Content-Type": "application/json" }, status: 200 }
  );
});
