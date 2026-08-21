import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseServer } from "@/integrations/supabase/supabase.server";

export type ClassRole = "student" | "class_leader" | "teacher" | "admin";

export interface RosterEntry {
  id: string;
  full_name: string | null;
  email: string;
  role: ClassRole;
  section: string | null;
  removed_at: string | null;
  attendancePercentage: number | null;
  classroomPending: number;
  classroomOverdue: number;
  classroomCompleted: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randomPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => b.toString(36)).join("").slice(0, 14);
  return `Acs-${raw}-${Math.floor(Math.random() * 90 + 10)}!`;
}

async function getCallerProfile(userId: string) {
  if (!supabaseServer) throw new Error("Database unavailable");
  const { data, error } = await supabaseServer
    .from("profiles")
    .select("id, role, section, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  if (!data) throw new Error("Profile not found for the current user.");
  return data as { id: string; role: ClassRole; section: string | null; full_name: string | null };
}

async function requireRole(userId: string, roles: ClassRole[]) {
  const profile = await getCallerProfile(userId);
  if (!roles.includes(profile.role)) {
    throw new Error(`Forbidden: requires role ${roles.join(" or ")}, caller is '${profile.role}'.`);
  }
  return profile;
}

// ─── Server Function: current user's role + section ─────────────────────────
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ role: ClassRole; section: string | null; removed: boolean }> => {
    try {
      const profile = await getCallerProfile(context.userId);
      return { role: profile.role, section: profile.section, removed: false };
    } catch {
      return { role: "student", section: null, removed: false };
    }
  });

// ─── Server Function: roster for the caller's section (teacher + CR) ────────
export const listMySectionStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RosterEntry[]> => {
    const caller = await requireRole(context.userId, ["teacher", "class_leader"]);
    if (!supabaseServer) throw new Error("Database unavailable");
    if (!caller.section) return [];

    const { data: profiles, error } = await supabaseServer
      .from("profiles")
      .select("id, full_name, role, section, removed_at")
      .eq("section", caller.section)
      .in("role", ["student", "class_leader"])
      .order("full_name", { ascending: true });
    if (error) throw new Error(`Failed to load roster: ${error.message}`);
    if (!profiles || profiles.length === 0) return [];

    const ids = profiles.map((p: any) => p.id);

    // Emails live on auth.users, not profiles — fetch via admin API per id
    // (small section rosters, so N calls is fine).
    const emails = new Map<string, string>();
    await Promise.all(
      ids.map(async (id: string) => {
        try {
          const { data } = await supabaseServer!.auth.admin.getUserById(id);
          if (data?.user?.email) emails.set(id, data.user.email);
        } catch {}
      })
    );

    const { data: attRows } = await supabaseServer
      .from("student_attendance")
      .select("user_id, attended_classes, total_classes")
      .in("user_id", ids);
    const attByUser = new Map<string, { att: number; tot: number }>();
    for (const r of attRows || []) {
      const cur = attByUser.get(r.user_id) || { att: 0, tot: 0 };
      cur.att += Number(r.attended_classes) || 0;
      cur.tot += Number(r.total_classes) || 0;
      attByUser.set(r.user_id, cur);
    }

    const { data: taskRows } = await supabaseServer
      .from("classroom_tasks")
      .select("user_id, status")
      .in("user_id", ids);
    const tasksByUser = new Map<string, { pending: number; overdue: number; completed: number }>();
    for (const r of taskRows || []) {
      const cur = tasksByUser.get(r.user_id) || { pending: 0, overdue: 0, completed: 0 };
      const s = String(r.status || "").toUpperCase();
      if (s === "COMPLETED" || s === "GRADED") cur.completed += 1;
      else if (s === "OVERDUE") cur.overdue += 1;
      else cur.pending += 1;
      tasksByUser.set(r.user_id, cur);
    }

    return profiles.map((p: any) => {
      const att = attByUser.get(p.id);
      const tasks = tasksByUser.get(p.id) || { pending: 0, overdue: 0, completed: 0 };
      return {
        id: p.id,
        full_name: p.full_name,
        email: emails.get(p.id) || "—",
        role: p.role,
        section: p.section,
        removed_at: p.removed_at,
        attendancePercentage: att && att.tot > 0 ? Number(((att.att / att.tot) * 100).toFixed(2)) : null,
        classroomPending: tasks.pending,
        classroomOverdue: tasks.overdue,
        classroomCompleted: tasks.completed,
      };
    });
  });

// ─── Server Function: create a new student account (teacher only) ──────────
export const createStudentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email(), fullName: z.string().min(1).max(120) }).parse(input)
  )
  .handler(async ({ data, context }): Promise<{ email: string; password: string }> => {
    const caller = await requireRole(context.userId, ["teacher"]);
    if (!supabaseServer) throw new Error("Database unavailable");
    if (!caller.section) throw new Error("Your account has no section set — cannot add students.");

    const password = randomPassword();
    const { data: created, error: createErr } = await supabaseServer.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createErr || !created?.user) {
      throw new Error(`Failed to create account: ${createErr?.message || "unknown error"}`);
    }

    const { error: profErr } = await supabaseServer.from("profiles").upsert([
      {
        id: created.user.id,
        full_name: data.fullName,
        role: "student",
        section: caller.section,
        updated_at: new Date().toISOString(),
      },
    ]);
    if (profErr) throw new Error(`Account created but profile setup failed: ${profErr.message}`);

    return { email: data.email, password };
  });

// ─── Server Function: edit a student's profile (teacher only) ──────────────
export const updateStudentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string(),
      fullName: z.string().min(1).max(120).optional(),
      degree: z.string().max(80).optional(),
      semester: z.string().max(40).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await requireRole(context.userId, ["teacher"]);
    if (!supabaseServer) throw new Error("Database unavailable");

    const { data: target, error: fetchErr } = await supabaseServer
      .from("profiles").select("id, section").eq("id", data.id).maybeSingle();
    if (fetchErr || !target) throw new Error("Student not found.");
    if (target.section !== caller.section) throw new Error("Forbidden: student is not in your section.");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.fullName !== undefined) patch.full_name = data.fullName;
    if (data.degree !== undefined) patch.degree = data.degree;
    if (data.semester !== undefined) patch.semester = data.semester;

    const { error } = await supabaseServer.from("profiles").update(patch).eq("id", data.id);
    if (error) throw new Error(`Update failed: ${error.message}`);
    return { ok: true };
  });

// ─── Server Function: remove (soft-block) a student (teacher only) ─────────
export const removeStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await requireRole(context.userId, ["teacher"]);
    if (!supabaseServer) throw new Error("Database unavailable");

    const { data: target, error: fetchErr } = await supabaseServer
      .from("profiles").select("id, section, role").eq("id", data.id).maybeSingle();
    if (fetchErr || !target) throw new Error("Student not found.");
    if (target.section !== caller.section) throw new Error("Forbidden: student is not in your section.");
    if (target.role === "teacher" || target.role === "admin") {
      throw new Error("Cannot remove a teacher or admin account.");
    }

    const { error } = await supabaseServer
      .from("profiles")
      .update({ removed_at: new Date().toISOString(), removed_by: caller.id })
      .eq("id", data.id);
    if (error) throw new Error(`Removal failed: ${error.message}`);
    return { ok: true };
  });

// ─── Server Function: assign / re-assign the Class Leader (teacher only) ───
export const assignClassLeader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ studentId: z.string() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await requireRole(context.userId, ["teacher"]);
    if (!supabaseServer) throw new Error("Database unavailable");

    const { data: target, error: fetchErr } = await supabaseServer
      .from("profiles").select("id, section, role").eq("id", data.studentId).maybeSingle();
    if (fetchErr || !target) throw new Error("Student not found.");
    if (target.section !== caller.section) throw new Error("Forbidden: student is not in your section.");
    if (target.role === "teacher" || target.role === "admin") {
      throw new Error("Cannot make a teacher/admin the Class Leader.");
    }

    // Demote any existing Class Leader in this section — one CR at a time.
    await supabaseServer
      .from("profiles")
      .update({ role: "student", updated_at: new Date().toISOString() })
      .eq("section", caller.section)
      .eq("role", "class_leader");

    const { error } = await supabaseServer
      .from("profiles")
      .update({ role: "class_leader", updated_at: new Date().toISOString() })
      .eq("id", data.studentId);
    if (error) throw new Error(`Assignment failed: ${error.message}`);
    return { ok: true };
  });

// ─── Server Function: upload/replace the section timetable (CR only) ───────
const timetableRowSchema = z.object({
  dayOfWeek: z.string().min(1).max(20),
  periodNumber: z.number().int().min(1).max(20),
  startTime: z.string().max(20).optional(),
  endTime: z.string().max(20).optional(),
  subjectCode: z.string().max(40).optional(),
  subjectName: z.string().min(1).max(120),
});

export const upsertTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ rows: z.array(timetableRowSchema) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; count: number }> => {
    const caller = await requireRole(context.userId, ["class_leader"]);
    if (!supabaseServer) throw new Error("Database unavailable");
    if (!caller.section) throw new Error("Your account has no section set.");

    // Full replace, not an upsert: the editor sends the *complete* current
    // grid every save, so a cell the CR cleared needs its old row deleted,
    // not left stale. Delete-then-insert rather than a partial upsert.
    const { error: delErr } = await supabaseServer
      .from("class_timetables")
      .delete()
      .eq("section", caller.section);
    if (delErr) throw new Error(`Timetable save failed: ${delErr.message}`);

    if (data.rows.length === 0) return { ok: true, count: 0 };

    const rows = data.rows.map((r) => ({
      section: caller.section,
      day_of_week: r.dayOfWeek,
      period_number: r.periodNumber,
      start_time: r.startTime || null,
      end_time: r.endTime || null,
      subject_code: r.subjectCode || null,
      subject_name: r.subjectName,
      uploaded_by: caller.id,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseServer.from("class_timetables").insert(rows);
    if (error) throw new Error(`Timetable save failed: ${error.message}`);
    return { ok: true, count: rows.length };
  });

// ─── Server Function: read the caller's own section timetable ──────────────
export interface TimetableRow {
  dayOfWeek: string;
  periodNumber: number;
  startTime: string | null;
  endTime: string | null;
  subjectCode: string | null;
  subjectName: string;
}

export const getTimetable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TimetableRow[]> => {
    const caller = await getCallerProfile(context.userId);
    if (!supabaseServer || !caller.section) return [];

    const { data, error } = await supabaseServer
      .from("class_timetables")
      .select("day_of_week, period_number, start_time, end_time, subject_code, subject_name")
      .eq("section", caller.section)
      .order("period_number", { ascending: true });
    if (error) return [];

    return (data || []).map((r: any) => ({
      dayOfWeek: r.day_of_week,
      periodNumber: r.period_number,
      startTime: r.start_time,
      endTime: r.end_time,
      subjectCode: r.subject_code,
      subjectName: r.subject_name,
    }));
  });
