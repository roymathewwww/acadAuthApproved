import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseServer } from "@/integrations/supabase/supabase.server";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SubjectAttendance {
  id: string;
  name: string;
  code: string;
  type: string;
  attended: number;
  conducted: number;
  percentage: number;
  status: "Excellent" | "Safe" | "Warning" | "Critical";
  statusColor: "green" | "blue" | "yellow" | "red";
  safeBunks: number;
  recoveryNeeded: number;
}

export interface DailyAttendanceRecord {
  subjectCode: string;
  subjectName: string;
  date: string;
  period: string | null;
  status: "present" | "absent" | "holiday" | "cancelled";
}

export interface AttendanceDashboardData {
  overall: {
    percentage: number;
    totalAttended: number;
    totalConducted: number;
    requiredFor75: number;
    safeMissesCount: number;
    status: "Excellent" | "Safe" | "Warning" | "Critical";
    statusColor: "green" | "blue" | "yellow" | "red";
    subjectsAtRiskCount: number;
    criticalSubjectsCount: number;
  };
  subjects: SubjectAttendance[];
  daily: DailyAttendanceRecord[];
  lastSyncedAt: string | null;
}

// ─── Helper Functions ───────────────────────────────────────────────────────
function calculateStatus(pct: number): {
  status: "Excellent" | "Safe" | "Warning" | "Critical";
  color: "green" | "blue" | "yellow" | "red";
} {
  if (pct >= 90) return { status: "Excellent", color: "green" };
  if (pct >= 85) return { status: "Safe", color: "blue" };
  if (pct >= 75) return { status: "Warning", color: "yellow" };
  return { status: "Critical", color: "red" };
}

function calculateSafeBunks(attended: number, conducted: number): number {
  if (conducted === 0) return 0;
  const currentPct = (attended / conducted) * 100;
  if (currentPct < 75) return 0;
  return Math.max(0, Math.floor((4 * attended - 3 * conducted) / 3));
}

function calculateRecoveryNeeded(attended: number, conducted: number): number {
  if (conducted === 0) return 0;
  const currentPct = (attended / conducted) * 100;
  if (currentPct >= 75) return 0;
  return Math.max(0, Math.ceil(3 * conducted - 4 * attended));
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "asx_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Server Function: Get Full Attendance Dashboard (real CUE-synced data) ──
export const getAttendanceDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AttendanceDashboardData> => {
    const { userId } = context;
    const empty: AttendanceDashboardData = {
      overall: {
        percentage: 0, totalAttended: 0, totalConducted: 0, requiredFor75: 0,
        safeMissesCount: 0, status: "Safe", statusColor: "blue",
        subjectsAtRiskCount: 0, criticalSubjectsCount: 0,
      },
      subjects: [],
      daily: [],
      lastSyncedAt: null,
    };

    if (!supabaseServer) return empty;

    const { data: rows, error } = await supabaseServer
      .from("student_attendance")
      .select("subject_code, subject_name, subject_type, attended_classes, total_classes, percentage, last_synced_at")
      .eq("user_id", userId)
      .order("subject_name", { ascending: true });

    if (error) {
      console.warn("[attendance.functions] student_attendance fetch warning:", error.message);
      return empty;
    }
    if (!rows || rows.length === 0) return empty;

    let totalAttended = 0;
    let totalConducted = 0;
    let lastSyncedAt: string | null = null;

    const subjects: SubjectAttendance[] = rows.map((s: any) => {
      const attended = Number(s.attended_classes) || 0;
      const conducted = Number(s.total_classes) || 0;
      const pct = conducted > 0 ? Number(((attended / conducted) * 100).toFixed(2)) : Number(s.percentage) || 100;
      totalAttended += attended;
      totalConducted += conducted;
      if (!lastSyncedAt || (s.last_synced_at && s.last_synced_at > lastSyncedAt)) {
        lastSyncedAt = s.last_synced_at;
      }
      const { status, color } = calculateStatus(pct);
      return {
        id: s.subject_code,
        name: s.subject_name,
        code: s.subject_code,
        type: s.subject_type || "Theory",
        attended,
        conducted,
        percentage: pct,
        status,
        statusColor: color,
        safeBunks: calculateSafeBunks(attended, conducted),
        recoveryNeeded: calculateRecoveryNeeded(attended, conducted),
      };
    });

    const overallPct = totalConducted > 0 ? Number(((totalAttended / totalConducted) * 100).toFixed(2)) : 100;
    const overallStatus = calculateStatus(overallPct);

    // Recent day-wise log (last 60 days, most recent first)
    const { data: dailyRows } = await supabaseServer
      .from("student_attendance_daily")
      .select("subject_code, subject_name, class_date, period, status")
      .eq("user_id", userId)
      .order("class_date", { ascending: false })
      .limit(200);

    const daily: DailyAttendanceRecord[] = (dailyRows || []).map((d: any) => ({
      subjectCode: d.subject_code,
      subjectName: d.subject_name || d.subject_code,
      date: d.class_date,
      period: d.period,
      status: d.status,
    }));

    return {
      overall: {
        percentage: overallPct,
        totalAttended,
        totalConducted,
        requiredFor75: calculateRecoveryNeeded(totalAttended, totalConducted),
        safeMissesCount: calculateSafeBunks(totalAttended, totalConducted),
        status: overallStatus.status,
        statusColor: overallStatus.color,
        subjectsAtRiskCount: subjects.filter((s) => s.percentage >= 75 && s.percentage < 85).length,
        criticalSubjectsCount: subjects.filter((s) => s.percentage < 75).length,
      },
      subjects,
      daily,
      lastSyncedAt,
    };
  });

// ─── Server Function: Get or create this user's extension sync token ───────
export const getSyncToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ token: string; lastUsedAt: string | null }> => {
    const { userId } = context;
    if (!supabaseServer) throw new Error("Database unavailable");

    const { data: existing } = await supabaseServer
      .from("attendance_sync_tokens")
      .select("token, last_used_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) return { token: existing.token, lastUsedAt: existing.last_used_at };

    const token = randomToken();
    const { error } = await supabaseServer
      .from("attendance_sync_tokens")
      .insert([{ user_id: userId, token }]);

    if (error) throw new Error(`Failed to create sync token: ${error.message}`);
    return { token, lastUsedAt: null };
  });

// ─── Server Function: Regenerate (revoke old, issue new) sync token ────────
export const regenerateSyncToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ token: string }> => {
    const { userId } = context;
    if (!supabaseServer) throw new Error("Database unavailable");

    const token = randomToken();
    const { error } = await supabaseServer
      .from("attendance_sync_tokens")
      .upsert([{ user_id: userId, token, last_used_at: null }], { onConflict: "user_id" });

    if (error) throw new Error(`Failed to regenerate sync token: ${error.message}`);
    return { token };
  });
