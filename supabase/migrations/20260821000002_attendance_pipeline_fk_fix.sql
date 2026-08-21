-- Migration: drop the auth.users foreign keys added in pipeline v2
-- This app supports a "demo" login mode (requireSupabaseAuth middleware,
-- token prefix demo_/google_/sb_session_) whose user_id comes from a local
-- SQLite users table, not necessarily a row in Supabase's own auth.users.
-- The FK constraints silently rejected inserts for those accounts (the
-- get-or-create sync token, and any attendance sync) with no error surfaced
-- in the UI. threads/messages already use a bare TEXT/UUID user_id with no
-- such FK for exactly this reason — match that working pattern here.
-- All access to these tables goes exclusively through server functions
-- using the service-role key (bypasses RLS), so the auth.uid() policies
-- are harmless defense-in-depth, not a real gate — safe to keep as-is.

ALTER TABLE public.attendance_sync_tokens
    DROP CONSTRAINT IF EXISTS attendance_sync_tokens_user_id_fkey;

ALTER TABLE public.student_attendance_daily
    DROP CONSTRAINT IF EXISTS student_attendance_daily_user_id_fkey;

ALTER TABLE public.student_attendance
    DROP CONSTRAINT IF EXISTS student_attendance_user_id_fkey;
