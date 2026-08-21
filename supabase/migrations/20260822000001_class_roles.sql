-- Migration: three-tier class roles (student / class_leader / teacher / admin)
-- Adds a lightweight, section-scoped role model directly on profiles rather
-- than resurrecting the unused 20260623000000_studentos_premium_schema.sql
-- (verified never applied live, and modeled per-student rather than
-- per-section, which doesn't fit a single-CR-per-class design).

-- ── 1. profiles: role, section, soft-removal ────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'class_leader', 'teacher', 'admin'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_profiles_section ON public.profiles (section);

-- ── 2. class_timetables: section-scoped, CR-managed ─────────────────────────
CREATE TABLE IF NOT EXISTS public.class_timetables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  period_number INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  subject_code TEXT,
  subject_name TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section, day_of_week, period_number)
);

ALTER TABLE public.class_timetables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own section timetable" ON public.class_timetables;
CREATE POLICY "Users can view their own section timetable"
  ON public.class_timetables FOR SELECT
  USING (
    section IN (SELECT p.section FROM public.profiles p WHERE p.id = auth.uid())
  );
-- No public write policy — writes go exclusively through server functions
-- using the service-role key, which independently re-checks role/section.

CREATE INDEX IF NOT EXISTS idx_class_timetables_section ON public.class_timetables (section);

-- ── 3. community_posts: denormalized author role for feed styling ──────────
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS author_role TEXT DEFAULT 'student';
