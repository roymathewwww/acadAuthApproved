-- Migration: Attendance pipeline v2 — secure extension sync + day-wise log
-- Replaces the old public-write student_attendance policy (a real hole: anyone
-- with the anon key could read/overwrite ANY student's row) with a token-gated
-- model, and adds day-wise records for the class-wise/day-wise log view.

-- ── 1. Per-user secret sync token (extension auth) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_sync_tokens (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

ALTER TABLE public.attendance_sync_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sync token" ON public.attendance_sync_tokens;
CREATE POLICY "Users can view their own sync token"
    ON public.attendance_sync_tokens FOR SELECT
    USING (auth.uid() = user_id);
-- No insert/update/delete policy for regular users — only the service role
-- (server functions / edge functions) may write tokens.

-- ── 2. Day-wise / class-wise attendance log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_attendance_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_code TEXT NOT NULL,
    subject_name TEXT,
    class_date DATE NOT NULL,
    period TEXT,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'holiday', 'cancelled')),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, subject_code, class_date, period)
);

ALTER TABLE public.student_attendance_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own daily attendance" ON public.student_attendance_daily;
CREATE POLICY "Users can view their own daily attendance"
    ON public.student_attendance_daily FOR SELECT
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_student_attendance_daily_user_date
    ON public.student_attendance_daily (user_id, class_date DESC);

-- ── 3. student_attendance (course-wise summary) ─────────────────────────────
-- Turns out this table doesn't currently exist on this project at all (an
-- earlier migration file claimed to create it, but was never actually
-- applied here — this project's migration history is untracked/ad-hoc).
-- Create it fresh with the correct schema from the start: real UUID user_id,
-- owner-only read policy, no public write policy — all writes go exclusively
-- through the sync-attendance edge function using the service-role key,
-- which bypasses RLS after validating the sync token server-side.

CREATE TABLE IF NOT EXISTS public.student_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_code TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    subject_type TEXT DEFAULT 'Theory',
    attended_classes INTEGER DEFAULT 0,
    total_classes INTEGER DEFAULT 0,
    percentage DOUBLE PRECISION DEFAULT 100.0,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT student_attendance_user_subject_key UNIQUE (user_id, subject_code)
);

ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;

-- Defensive: drop any legacy world-writable policies if this table (or an
-- older version of it) already existed under a different history.
DROP POLICY IF EXISTS "Allow public read on student_attendance" ON public.student_attendance;
DROP POLICY IF EXISTS "Allow public insert/update on student_attendance" ON public.student_attendance;
DROP POLICY IF EXISTS "Users can view their own attendance" ON public.student_attendance;
DROP POLICY IF EXISTS "Users can insert/update their own attendance" ON public.student_attendance;

CREATE POLICY "Users can view their own attendance"
    ON public.student_attendance FOR SELECT
    USING (auth.uid() = user_id);
-- No public write policy — service role (edge function) only, via RLS bypass.

CREATE INDEX IF NOT EXISTS idx_student_attendance_user_id
    ON public.student_attendance (user_id);
