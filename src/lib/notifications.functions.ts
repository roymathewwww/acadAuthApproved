import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseServer } from "@/integrations/supabase/supabase.server";
import { sendEmail, renderEmail, getEmailProvider } from "./email.server";

// ─── Assignment reminders, by email ───────────────────────────────────────────
// Replaces the old Twilio/Fast2SMS path: students now get the same alerts at
// the address they signed in with, so there's no phone number to collect and
// no per-country SMS routing to maintain.
//
// Schedule: 12h / 6h / 1h before a due date, plus a daily nudge while a
// submission is still pending past its deadline.
//
// Note on storage: the existing classroom_tasks columns are reused as-is —
// notified_24h is the "first reminder sent" flag (now fired at 12h, not 24h),
// and profiles.sms_notifications_enabled is the general notifications toggle.
// Reusing them keeps this working against the live schema with no migration,
// which matters because this project's Supabase schema has drifted from its
// migration files before.

const REMINDER_WINDOWS = [
  { hours: 12, flag: "notified_24h" as const, label: "12 hours" },
  { hours: 6, flag: "notified_6h" as const, label: "6 hours" },
  { hours: 1, flag: "notified_1h" as const, label: "1 hour" },
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DigestInputSchema = z.object({
  pending: z.number().int().min(0),
  overdue: z.number().int().min(0),
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
  courses: z.number().int().min(0),
});

/**
 * On-demand classroom digest — what the Classroom page's alert button sends.
 * Always goes to the address on the caller's own session, so there's nothing
 * to configure per user and no way to email someone else by accident.
 */
export const sendClassroomDigestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DigestInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ sentTo: string }> => {
    const to = (context as any)?.user?.email as string | undefined;
    if (!to || !to.includes("@")) {
      throw new Error("Your account has no email address attached, so there's nowhere to send this.");
    }

    const name = to.split("@")[0];
    const stamp = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const { html, text } = renderEmail({
      heading: "Your classroom snapshot",
      intro: `Hi ${name}, here's where your coursework stands as of ${stamp}.`,
      rows: [
        { label: "Total assignments", value: String(data.total) },
        { label: "Pending submissions", value: String(data.pending) },
        { label: "Overdue (action needed)", value: String(data.overdue) },
        { label: "Submitted / graded", value: String(data.completed) },
        { label: "Active subjects", value: String(data.courses) },
      ],
      callout:
        data.overdue > 0
          ? {
              text: `${data.overdue} assignment${data.overdue > 1 ? "s are" : " is"} overdue — submit as soon as you can.`,
              tone: "bad",
            }
          : data.pending > 0
            ? { text: `${data.pending} submission${data.pending > 1 ? "s" : ""} still pending.`, tone: "warn" }
            : { text: "Nothing overdue and nothing pending — you're all caught up.", tone: "good" },
      footer: "Sent from the Classroom page in AcadSphere.",
    });

    await sendEmail({ to, subject: `AcadSphere — coursework snapshot (${stamp})`, html, text });
    return { sentTo: to };
  });

interface ReminderTask {
  id: string;
  user_id: string;
  title: string;
  course_name: string | null;
  due_date: string | null;
  notified_24h: boolean | null;
  notified_6h: boolean | null;
  notified_1h: boolean | null;
  last_overdue_notice: string | null;
}

/**
 * The scheduled pass: walks every pending task and emails whichever reminders
 * are now due. Safe to call repeatedly — each reminder is flagged on the task
 * row once sent, so a cron running every 15 minutes never double-sends.
 *
 * Returns counts rather than throwing on individual failures, so one bad
 * address can't stop the rest of the run.
 */
export async function runSubmissionReminders(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  if (!getEmailProvider()) {
    return { sent: 0, skipped: 0, errors: ["No email provider configured (set RESEND_API_KEY or BREVO_API_KEY)."] };
  }
  if (!supabaseServer) {
    return { sent: 0, skipped: 0, errors: ["Supabase server client unavailable."] };
  }

  const { data: tasks, error } = await supabaseServer
    .from("classroom_tasks")
    .select("id, user_id, title, course_name, due_date, notified_24h, notified_6h, notified_1h, last_overdue_notice")
    .eq("status", "PENDING")
    .not("due_date", "is", null);

  if (error) return { sent: 0, skipped: 0, errors: [`Task fetch failed: ${error.message}`] };
  if (!tasks || tasks.length === 0) return { sent: 0, skipped: 0, errors };

  // One lookup per distinct user rather than per task — a student with eight
  // pending assignments shouldn't cost eight identical admin API calls.
  const userIds: string[] = Array.from(new Set((tasks as any[]).map((t) => String(t.user_id))));
  const recipients = new Map<string, string>();
  const optedOut = new Set<string>();

  const { data: profiles } = await supabaseServer
    .from("profiles")
    .select("id, sms_notifications_enabled")
    .in("id", userIds);
  for (const p of profiles || []) {
    if ((p as any).sms_notifications_enabled === false) optedOut.add((p as any).id);
  }

  await Promise.all(
    userIds
      .filter((id) => !optedOut.has(id))
      .map(async (id) => {
        try {
          const { data } = await supabaseServer!.auth.admin.getUserById(id);
          const email = data?.user?.email;
          if (email) recipients.set(id, email);
        } catch (e: any) {
          errors.push(`Email lookup failed for ${id}: ${e?.message || e}`);
        }
      }),
  );

  const now = new Date();
  let sent = 0;
  let skipped = 0;
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const raw of tasks as ReminderTask[]) {
    const to = recipients.get(raw.user_id);
    if (!to) {
      skipped++;
      continue;
    }

    const due = new Date(raw.due_date!);
    const hoursLeft = (due.getTime() - now.getTime()) / HOUR_MS;
    const subjectName = raw.course_name || "your course";
    const patch: Record<string, unknown> = {};

    // Pre-deadline reminders — the tightest unsent window wins, so a task
    // discovered late doesn't fire three emails back to back.
    const dueWindow = REMINDER_WINDOWS.find(
      (w) => hoursLeft > 0 && hoursLeft <= w.hours && !raw[w.flag],
    );

    if (dueWindow) {
      const remaining = hoursLeft < 1 ? "under an hour" : `about ${Math.ceil(hoursLeft)} hours`;
      const { html, text } = renderEmail({
        heading: `Due in ${remaining}: ${raw.title}`,
        intro: `Your submission for ${subjectName} is still pending, and the deadline is ${remaining} away.`,
        rows: [
          { label: "Assignment", value: raw.title },
          { label: "Subject", value: subjectName },
          {
            label: "Due",
            value: due.toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
          },
        ],
        callout: {
          text: dueWindow.hours === 1 ? "Final reminder — submit now." : "Submit before the deadline to stay on track.",
          tone: dueWindow.hours === 1 ? "bad" : "warn",
        },
      });

      try {
        await sendEmail({ to, subject: `Due in ${remaining}: ${raw.title}`, html, text });
        patch[dueWindow.flag] = true;
        sent++;
      } catch (e: any) {
        errors.push(`Send failed for task ${raw.id}: ${e?.message || e}`);
      }
    }

    // Still pending after the deadline — one nudge per day, for two weeks.
    if (hoursLeft < 0) {
      const daysOverdue = Math.abs(hoursLeft) / 24;
      const lastNotice = raw.last_overdue_notice ? new Date(raw.last_overdue_notice) : null;
      const dueForNudge = !lastNotice || now.getTime() - lastNotice.getTime() >= DAY_MS;

      if (daysOverdue <= 14 && dueForNudge) {
        const days = Math.max(1, Math.ceil(daysOverdue));
        const { html, text } = renderEmail({
          heading: `Overdue: ${raw.title}`,
          intro: `This submission for ${subjectName} is ${days} day${days > 1 ? "s" : ""} past its deadline and still shows as pending.`,
          rows: [
            { label: "Assignment", value: raw.title },
            { label: "Subject", value: subjectName },
            { label: "Days overdue", value: String(days) },
          ],
          callout: { text: "Submit as soon as possible, or check with your faculty about late submission.", tone: "bad" },
        });

        try {
          await sendEmail({ to, subject: `Overdue: ${raw.title}`, html, text });
          patch.last_overdue_notice = now.toISOString();
          sent++;
        } catch (e: any) {
          errors.push(`Overdue send failed for task ${raw.id}: ${e?.message || e}`);
        }
      }
    }

    if (Object.keys(patch).length > 0) patches.push({ id: raw.id, patch });
  }

  // Flag writes happen after sending so a delivery failure doesn't mark a
  // reminder as sent and silently swallow it.
  await Promise.allSettled(
    patches.map(({ id, patch }) => supabaseServer!.from("classroom_tasks").update(patch).eq("id", id)),
  );

  return { sent, skipped, errors };
}

/** Manual trigger for the reminder pass (useful for testing the schedule). */
export const triggerSubmissionReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => runSubmissionReminders());
