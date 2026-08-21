/**
 * Supabase Edge Function: sync-attendance
 * ───────────────────────────────────────
 * Ingestion endpoint for the AcadSphere CUE Sync browser extension.
 *
 * Auth model: the extension holds a per-user opaque sync token (generated
 * once in AcadSphere → Attendance → Connect Extension, never the user_id
 * itself). This function resolves the token to a user_id server-side using
 * the service-role key — the anon key alone is never enough to write data,
 * closing the "anyone can overwrite anyone's attendance" hole the previous
 * version had.
 *
 * Accepts:
 *   {
 *     token: string,                 // required — the extension's sync token
 *     course_wise: CueSubject[],     // required — per-subject summary
 *     daily?: CueDailyRecord[],      // optional — best-effort day-wise log
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

interface CueSubject {
  name: string;
  code: string;
  type?: string;
  attended: number;
  total: number;
}

interface CueDailyRecord {
  subjectCode: string;
  subjectName?: string;
  date: string;    // YYYY-MM-DD
  period?: string;
  status: "present" | "absent" | "holiday" | "cancelled";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  try {
    const { token, course_wise, daily } = await req.json();

    if (!token || typeof token !== "string") {
      return jsonResp({ error: "Missing sync token. Paste it in the extension popup from AcadSphere → Attendance → Connect Extension." }, 401);
    }
    if (!Array.isArray(course_wise) || course_wise.length === 0) {
      return jsonResp({ error: "No course-wise attendance data was scraped from the page. Make sure you're on the CUE attendance page (cue.christuniversity.in/main/attendence)." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── Resolve token → user_id (this is the actual authentication step) ────
    const { data: tokenRow, error: tokenErr } = await admin
      .from("attendance_sync_tokens")
      .select("user_id")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr) {
      console.error("[sync-attendance] token lookup error:", tokenErr.message);
      return jsonResp({ error: "Could not verify sync token." }, 500);
    }
    if (!tokenRow) {
      return jsonResp({ error: "Invalid or revoked sync token. Generate a new one in AcadSphere → Attendance → Connect Extension." }, 401);
    }
    const userId = tokenRow.user_id as string;

    // ── Upsert course-wise summary ───────────────────────────────────────────
    const courseRecords = (course_wise as CueSubject[]).map((sub) => ({
      user_id: userId,
      subject_code: String(sub.code || "N/A").trim(),
      subject_name: String(sub.name || sub.code || "Untitled").trim(),
      subject_type: sub.type || "Theory",
      attended_classes: Math.max(0, Math.round(Number(sub.attended) || 0)),
      total_classes: Math.max(0, Math.round(Number(sub.total) || 0)),
      percentage: sub.total > 0 ? Number(((sub.attended / sub.total) * 100).toFixed(2)) : 100,
      last_synced_at: new Date().toISOString(),
    }));

    const { error: courseErr } = await admin
      .from("student_attendance")
      .upsert(courseRecords, { onConflict: "user_id,subject_code" });

    if (courseErr) {
      console.error("[sync-attendance] course upsert error:", courseErr.message);
      return jsonResp({ error: `Failed to save course-wise attendance: ${courseErr.message}` }, 500);
    }

    // ── Upsert day-wise log (best-effort — may be empty if the page's Daily
    //    Log tab couldn't be parsed; that's fine, course summary still saved) ──
    let dailyCount = 0;
    if (Array.isArray(daily) && daily.length > 0) {
      const dailyRecords = (daily as CueDailyRecord[])
        .filter((d) => d.date && d.subjectCode && d.status)
        .map((d) => ({
          user_id: userId,
          subject_code: String(d.subjectCode).trim(),
          subject_name: d.subjectName ? String(d.subjectName).trim() : null,
          class_date: d.date,
          period: d.period ? String(d.period).trim() : null,
          status: d.status,
          synced_at: new Date().toISOString(),
        }));

      if (dailyRecords.length > 0) {
        const { error: dailyErr } = await admin
          .from("student_attendance_daily")
          .upsert(dailyRecords, { onConflict: "user_id,subject_code,class_date,period" });

        if (dailyErr) {
          // Non-fatal — course-wise data already saved successfully.
          console.warn("[sync-attendance] daily upsert warning:", dailyErr.message);
        } else {
          dailyCount = dailyRecords.length;
        }
      }
    }

    // ── Mark token as used (lets the UI show "last synced via extension") ───
    await admin
      .from("attendance_sync_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token", token);

    return jsonResp({
      success: true,
      message: `Synced ${courseRecords.length} subject(s)${dailyCount ? ` and ${dailyCount} day-wise record(s)` : ""}.`,
      courseCount: courseRecords.length,
      dailyCount,
    }, 200);
  } catch (err: any) {
    console.error("[sync-attendance] Unhandled error:", err);
    return jsonResp({ error: err.message || "Failed to process attendance ingestion" }, 500);
  }
});
