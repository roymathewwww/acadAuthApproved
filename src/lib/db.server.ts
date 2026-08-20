// @ts-ignore
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import dns from "node:dns";
import crypto from "node:crypto";

// DNS patch to bypass local getaddrinfo failures for Supabase domain
const originalLookup = dns.lookup;
dns.lookup = function (this: any, hostname: string, options: any, callback: any) {
  return (originalLookup as any)(hostname, options, callback);
} as any;

let db: any;

export const MCA_CHRIST_STUDENTS = [
  { name: "AADHARSH KRISHNAA G", regNo: "2547201" },
  { name: "ABHINAV JAIN", regNo: "2547203" },
  { name: "AIMEE SUSAN JOSEPH", regNo: "2547204" },
  { name: "AJANYA VINAYAN", regNo: "2547205" },
  { name: "AKASHDEEP DEY", regNo: "2547206" },
  { name: "ALAN SOJAN", regNo: "2547208" },
  { name: "ALBIN THOMAS", regNo: "2547209" },
  { name: "ALOK TAYAL", regNo: "2547210" },
  { name: "AMOGH VENKAT D", regNo: "2547211" },
  { name: "ANAAMIKA KS", regNo: "2547212" },
  { name: "ANGEL BLESSY", regNo: "2547213" },
  { name: "ANNETTE ELIZABETH SHONEY", regNo: "2547216" },
  { name: "ANNIE NEENA A A", regNo: "2547217" },
  { name: "B K VISHNU", regNo: "2547218" },
  { name: "BHAVYA DHANUKA", regNo: "2547219" },
  { name: "DINU DEVEES GEORGE", regNo: "2547220" },
  { name: "EKTA SINGH", regNo: "2547221" },
  { name: "EMIMA J", regNo: "2547222" },
  { name: "ENRITA FERNANDES", regNo: "2547223" },
  { name: "EVAN JOHN MATHEW", regNo: "2547224" },
  { name: "EVANA JOSEPH", regNo: "2547225" },
  { name: "HANNA JOSHY", regNo: "2547226" },
  { name: "I BLESSY", regNo: "2547227" },
  { name: "JAI PAREEK", regNo: "2547228" },
  { name: "KARUN NAGARAJ", regNo: "2547229" },
  { name: "KUHELI BEGUM", regNo: "2547230" },
  { name: "KUNNAL", regNo: "2547231" },
  { name: "MAHAMAT TAHIR SOULEYMANE", regNo: "2547232" },
  { name: "MOHAMMED REHAN SAMIR INAMDAR", regNo: "2547233" },
  { name: "NAMRATHA R", regNo: "2547234" },
  { name: "NIRUPAMA VINCENT", regNo: "2547236" },
  { name: "OMKAAR CHAKRABORTY", regNo: "2547237" },
  { name: "PAAVAN GUPTA", regNo: "2547238" },
  { name: "PRAJWAL KT", regNo: "2547239" },
  { name: "PRANAV M R", regNo: "2547240" },
  { name: "R KARAN", regNo: "2547241" },
  { name: "RAHUL MOHAN GUPTA", regNo: "2547242" },
  { name: "RISHI RAJ", regNo: "2547243" },
  { name: "ROY MATHEW", regNo: "2547244" },
  { name: "SACHIN KUMAR D", regNo: "2547245" },
  { name: "SAURABH BURNWAL", regNo: "2547246" },
  { name: "SHARON MATHEW", regNo: "2547247" },
  { name: "SLAVEN DERICK PAIS", regNo: "2547249" },
  { name: "SNEHA VARGHESE", regNo: "2547250" },
  { name: "SUDEEPA SANTHANAM", regNo: "2547252" },
  { name: "VARUN SINGH", regNo: "2547254" },
  { name: "VISHWAS VASHISHTHA", regNo: "2547255" },
  { name: "XAVIER AMITH J", regNo: "2547256" },
  { name: "ANANYA M", regNo: "2547259" },
  { name: "MISTRY JAMIS KIRITKUMAR", regNo: "2547260" },
  { name: "MANIARASAN J", regNo: "2547261" },
  { name: "ANUSHKA SINGH", regNo: "2547262" },
];

export function formatStudentEmail(name: string): string {
  const formattedName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, "")
    .replace(/\s+/g, ".")
    .replace(/\.+/g, ".");
  return `${formattedName}@mca.christuniversity.in`;
}

export function seedMCAStudents(database: any) {
  console.log("[SQLite] Seeding 52 MCA Christ University student accounts...");
  const ADMIN_EMAIL = "admin@gmail.com";

  // Delete all old dummy non-admin users
  database.exec(`
    DELETE FROM users WHERE email != '${ADMIN_EMAIL}';
    DELETE FROM profiles WHERE id NOT IN (SELECT id FROM users);
    DELETE FROM students WHERE id NOT IN (SELECT id FROM users);
    DELETE FROM student_metrics WHERE user_id NOT IN (SELECT id FROM users);
    DELETE FROM subject_attendance WHERE student_id NOT IN (SELECT id FROM users);
  `);

  const insertUser = database.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, status) VALUES (?, ?, ?, 'active')");
  const insertProfile = database.prepare("INSERT OR REPLACE INTO profiles (id, full_name, role, degree, semester, target_role) VALUES (?, ?, 'student', 'MCA', 'Semester 4', 'Software Engineer')");
  const insertStudent = database.prepare("INSERT OR REPLACE INTO students (id, student_id, department, semester, section, phone, cgpa, attendance_percentage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertMetrics = database.prepare("INSERT OR REPLACE INTO student_metrics (id, user_id, roadmap_progress, study_consistency, notes_coverage, resume_strength, placement_readiness, skill_growth, success_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertSubAtt = database.prepare("INSERT OR REPLACE INTO subject_attendance (id, student_id, subject_id, subject_name, subject_code, classes_attended, classes_conducted, attendance_percentage) VALUES (?, ?, ?, ?, ?, ?, 50, ?)");

  const defaultSubjects = [
    { id: "sub1", name: "Database Management Systems", code: "CS301" },
    { id: "sub2", name: "Operating Systems", code: "CS302" },
    { id: "sub3", name: "Computer Networks", code: "CS303" },
    { id: "sub4", name: "Artificial Intelligence", code: "CS304" },
    { id: "sub5", name: "Software Engineering", code: "CS305" },
  ];

  for (const s of MCA_CHRIST_STUDENTS) {
    const email = formatStudentEmail(s.name);
    const pwHash = crypto.createHash("sha256").update(s.regNo).digest("hex");
    // Generate deterministic UUID based on regNo
    const userId = crypto.createHash("md5").update(email).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

    const phone = `+91 98765${s.regNo.slice(-5)}`;
    const cgpa = 7.5 + (parseInt(s.regNo.slice(-2), 10) % 25) / 10;
    const overallAtt = 70 + (parseInt(s.regNo.slice(-2), 10) % 28);

    insertUser.run(userId, email, pwHash);
    insertProfile.run(userId, s.name);
    insertStudent.run(userId, s.regNo, 'MCA', 'Semester 4', 'A', phone, cgpa, overallAtt);
    insertMetrics.run(
      crypto.randomUUID(),
      userId,
      65 + (parseInt(s.regNo.slice(-2), 10) % 30),
      80, 75, 85, 80, 78, 82
    );

    for (const sub of defaultSubjects) {
      const subAttended = Math.min(50, Math.max(30, Math.round(50 * (overallAtt / 100))));
      const subPct = Math.round((subAttended / 50) * 100);
      insertSubAtt.run(crypto.randomUUID(), userId, sub.id, sub.name, sub.code, subAttended, subPct);
    }
  }

  console.log(`[SQLite] Successfully seeded ${MCA_CHRIST_STUDENTS.length} student records into database.`);
}

try {
  // Store db in the workspace directory
  const dbPath = path.join(process.cwd(), "local.db");
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT,
      role TEXT DEFAULT 'student',
      degree TEXT,
      semester TEXT,
      target_role TEXT,
      current_skills TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      department TEXT DEFAULT 'MCA',
      semester TEXT DEFAULT 'Semester 4',
      section TEXT DEFAULT 'A',
      phone TEXT DEFAULT '',
      cgpa REAL DEFAULT 8.5,
      attendance_percentage REAL DEFAULT 90.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_metrics (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      roadmap_progress REAL DEFAULT 0,
      study_consistency REAL DEFAULT 0,
      notes_coverage REAL DEFAULT 0,
      resume_strength REAL DEFAULT 0,
      placement_readiness REAL DEFAULT 0,
      skill_growth REAL DEFAULT 0,
      success_score REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_profile (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      concept TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('roadmap', 'paper', 'notes', 'study')),
      confidence REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS knowledge_profile_user_id_idx ON knowledge_profile (user_id);

    CREATE TABLE IF NOT EXISTS student_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'ROADMAP_MILESTONE_COMPLETED',
        'STUDY_TASK_COMPLETED',
        'NOTES_ANALYZED',
        'PAPER_ANALYZED',
        'RESUME_ANALYZED',
        'CHAT_COMPLETED'
      )),
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS student_events_user_id_idx ON student_events (user_id);
    CREATE INDEX IF NOT EXISTS student_events_created_at_idx ON student_events (created_at);

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      module TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      degree TEXT NOT NULL,
      semester TEXT NOT NULL,
      subjects TEXT NOT NULL,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT REFERENCES study_plans(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS paper_analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      num_pages INTEGER,
      status TEXT NOT NULL,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes_analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      num_pages INTEGER,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      ip_address TEXT DEFAULT '127.0.0.1',
      status TEXT DEFAULT 'success',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT DEFAULT 'all',
      audience_filter TEXT,
      priority TEXT DEFAULT 'normal',
      scheduled_at DATETIME,
      expires_at DATETIME,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subject_attendance (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      classes_attended INTEGER DEFAULT 0,
      classes_conducted INTEGER DEFAULT 0,
      attendance_percentage REAL DEFAULT 100.0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS student_activities (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL,
      subject TEXT,
      duration_minutes INTEGER DEFAULT 0,
      score REAL DEFAULT 0,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS student_activities_user_id_idx ON student_activities (user_id);
    CREATE INDEX IF NOT EXISTS student_activities_created_at_idx ON student_activities (created_at);
  `);

  // ─── Migrate pre-existing DB files that predate the threads.module column ──
  try {
    db.exec("ALTER TABLE threads ADD COLUMN module TEXT;");
  } catch (_) {
    // column already exists — safe to ignore
  }

  // ─── Seed Admin User (admin@gmail.com / iamadmin@1) ──────────────────────
  const ADMIN_EMAIL = "admin@gmail.com";
  const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
  const ADMIN_HASH = crypto.createHash("sha256").update("iamadmin@1").digest("hex");
  try {
    const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
    if (!existingAdmin) {
      db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, status) VALUES (?, ?, ?, ?)").run(ADMIN_ID, ADMIN_EMAIL, ADMIN_HASH, "active");
      db.prepare("INSERT OR IGNORE INTO profiles (id, full_name, role) VALUES (?, ?, ?)").run(ADMIN_ID, "Administrator", "admin");
      console.log("[SQLite] Admin user seeded:", ADMIN_EMAIL);
    }
  } catch (e) {
    console.warn("[SQLite] Admin seed error:", e);
  }

  // Dummy/demo student seeding intentionally disabled — the local fallback
  // DB starts empty and stays empty until real records are added.
  // (seedMCAStudents() is kept below, unused, in case demo data is wanted
  // again later — see also seedAnalyticsData() in analytics.functions.ts.)

} catch (error) {
  console.error("[SQLite] Failed to initialize database:", error);
}

export function getDb() {
  if (!db) {
    db = new DatabaseSync(path.join(process.cwd(), "local.db"));
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS study_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        degree TEXT NOT NULL,
        semester TEXT NOT NULL,
        subjects TEXT NOT NULL,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS study_tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        plan_id TEXT REFERENCES study_plans(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS paper_analyses (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        num_pages INTEGER,
        status TEXT NOT NULL,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS notes_analyses (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        num_pages INTEGER,
        subject TEXT NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (_) {}
  return db;
}

import { createClient } from "@supabase/supabase-js";

let supabaseServerClient: any = null;

export function getSupabaseServerClient() {
  if (supabaseServerClient) return supabaseServerClient;
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  if (supabaseUrl && supabaseKey) {
    try {
      supabaseServerClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      });
      return supabaseServerClient;
    } catch (e) {
      console.warn("[Supabase Client Init Error]", e);
    }
  }
  return null;
}

export function ensureUserExistsInSqlite(userId: string, email?: string, name?: string) {
  if (!userId) return;
  try {
    const database = getDb();
    const existing = database.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!existing) {
      const userEmail = email || `${userId}@acadsphere.local`;
      const pwHash = crypto.createHash("sha256").update(userId).digest("hex");
      database.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, status) VALUES (?, ?, ?, 'active')").run(userId, userEmail, pwHash);
      database.prepare("INSERT OR IGNORE INTO profiles (id, full_name, role, degree, semester, target_role) VALUES (?, ?, 'student', 'MSc Big Data Analytics', 'Semester 4', 'Software Engineer')").run(userId, name || "Student");
    }
  } catch (err) {
    console.warn("[SQLite] ensureUserExistsInSqlite failed:", err);
  }
}
