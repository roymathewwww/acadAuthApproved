import { supabaseServer } from "@/integrations/supabase/supabase.server";
import { getDb, getSupabaseServerClient, ensureUserExistsInSqlite } from "@/lib/db.server";
import crypto from "node:crypto";

export type StudentMetricsRecord = {
    id: string;
    user_id: string;
    roadmap_progress: number;
    study_consistency: number;
    notes_coverage: number;
    resume_strength: number;
    placement_readiness: number;
    skill_growth: number;
    success_score: number;
    created_at: string;
    updated_at: string;
};

export type StudentMetricsUpdate = Partial<{
    roadmap_progress: number;
    study_consistency: number;
    notes_coverage: number;
    resume_strength: number;
    placement_readiness: number;
    skill_growth: number;
    success_score: number;
}>;

const DEFAULT_STUDENT_METRICS = {
    roadmap_progress: 0,
    study_consistency: 0,
    notes_coverage: 0,
    resume_strength: 0,
    placement_readiness: 0,
    skill_growth: 0,
    success_score: 0,
};

function clampMetric(value: number): number {
    return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function buildMetricPayload(data: StudentMetricsUpdate): Partial<StudentMetricsRecord> {
    return {
        ...(data.roadmap_progress !== undefined && { roadmap_progress: clampMetric(data.roadmap_progress) }),
        ...(data.study_consistency !== undefined && { study_consistency: clampMetric(data.study_consistency) }),
        ...(data.notes_coverage !== undefined && { notes_coverage: clampMetric(data.notes_coverage) }),
        ...(data.resume_strength !== undefined && { resume_strength: clampMetric(data.resume_strength) }),
        ...(data.placement_readiness !== undefined && { placement_readiness: clampMetric(data.placement_readiness) }),
        ...(data.skill_growth !== undefined && { skill_growth: clampMetric(data.skill_growth) }),
        ...(data.success_score !== undefined && { success_score: clampMetric(data.success_score) }),
    } as Partial<StudentMetricsRecord>;
}

// Helper to run query with SQLite fallback
async function runWithFallback<T>(
  supabaseOp: () => Promise<{ data: T | null; error: any }>,
  sqliteOp: () => T
): Promise<T> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabaseOp();
      if (!error && data !== null) {
        return data;
      }
    } catch (_) {}
  }
  return sqliteOp();
}

export async function getStudentMetrics(userId: string): Promise<StudentMetricsRecord | null> {
  return runWithFallback(
    async () => {
      const { data, error } = await supabaseServer
        .from('student_metrics')
        .select('*')
        .eq('user_id', userId)
        .single();
      return { data, error };
    },
    () => {
      const db = getDb();
      const row = db.prepare("SELECT * FROM student_metrics WHERE user_id = ?").get(userId) as any;
      if (!row) return null;
      return {
        id: row.id,
        user_id: row.user_id,
        roadmap_progress: row.roadmap_progress,
        study_consistency: row.study_consistency,
        notes_coverage: row.notes_coverage,
        resume_strength: row.resume_strength,
        placement_readiness: row.placement_readiness,
        skill_growth: row.skill_growth,
        success_score: row.success_score,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } as StudentMetricsRecord;
    }
  );
}

export async function createDefaultMetrics(userId: string): Promise<StudentMetricsRecord> {
    const existing = await getStudentMetrics(userId);
    if (existing) return existing;

    return runWithFallback(
      async () => {
        const { data, error } = await supabaseServer
          .from('student_metrics')
          .insert([{
              user_id: userId,
              ...DEFAULT_STUDENT_METRICS
          }])
          .select()
          .single();
        return { data, error };
      },
      () => {
        ensureUserExistsInSqlite(userId);
        const db = getDb();
        const id = crypto.randomUUID();
        const nowStr = new Date().toISOString();
        db.prepare(`
          INSERT INTO student_metrics (
            id, user_id, roadmap_progress, study_consistency, notes_coverage,
            resume_strength, placement_readiness, skill_growth, success_score, created_at, updated_at
          ) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, ?, ?)
        `).run(id, userId, nowStr, nowStr);

        return {
          id,
          user_id: userId,
          roadmap_progress: 0,
          study_consistency: 0,
          notes_coverage: 0,
          resume_strength: 0,
          placement_readiness: 0,
          skill_growth: 0,
          success_score: 0,
          created_at: nowStr,
          updated_at: nowStr,
        } as StudentMetricsRecord;
      }
    );
}

export async function updateStudentMetrics(userId: string, data: StudentMetricsUpdate): Promise<StudentMetricsRecord> {
    const payload = buildMetricPayload(data);
    
    // Ensure they exist first
    const existing = await getStudentMetrics(userId);
    if (!existing) {
        await createDefaultMetrics(userId);
    }

    return runWithFallback(
      async () => {
        const { data: updated, error } = await supabaseServer
          .from('student_metrics')
          .update({
              ...payload,
              updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .select()
          .single();
        return { data: updated, error };
      },
      () => {
        const db = getDb();
        const nowStr = new Date().toISOString();
        
        // Dynamically build the update statement
        const keys = Object.keys(payload);
        if (keys.length > 0) {
          const setClause = keys.map(k => `${k} = ?`).join(", ") + ", updated_at = ?";
          const values = keys.map(k => (payload as any)[k]);
          values.push(nowStr);
          values.push(userId);
          
          db.prepare(`UPDATE student_metrics SET ${setClause} WHERE user_id = ?`).run(...values);
        }

        const row = db.prepare("SELECT * FROM student_metrics WHERE user_id = ?").get(userId) as any;
        return {
          id: row.id,
          user_id: row.user_id,
          roadmap_progress: row.roadmap_progress,
          study_consistency: row.study_consistency,
          notes_coverage: row.notes_coverage,
          resume_strength: row.resume_strength,
          placement_readiness: row.placement_readiness,
          skill_growth: row.skill_growth,
          success_score: row.success_score,
          created_at: row.created_at,
          updated_at: row.updated_at,
        } as StudentMetricsRecord;
      }
    );
}
