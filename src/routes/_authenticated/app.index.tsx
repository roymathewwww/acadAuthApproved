import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { getAttendanceDashboardData } from "@/lib/attendance.functions";
import { getCachedClassroomTasks } from "@/lib/classroom.functions";
import { createThread } from "@/lib/chat.functions";
import { deriveDepartment } from "@/lib/derive-department";
import { motion } from "framer-motion";
import gsap from "gsap";
import {
  ArrowRight, Sparkles, GraduationCap, CheckCircle2, Clock, FileOutput, Users,
  ClipboardList, AlertCircle, ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") {
      const role = localStorage.getItem("demo_user_role");
      if (role === "admin") {
        throw redirect({ to: "/admin" });
      }
      // Teacher's "Dashboard" nav item is the class roster, not this
      // student-oriented home page — send them straight there.
      if (role === "teacher") {
        throw redirect({ to: "/app/students" });
      }
    }
  },
  component: AppIndex,
});

function AppIndex() {
  const navigate = useNavigate();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const attendanceNumberRef = useRef<HTMLSpanElement>(null);

  const getAttendanceFn = useServerFn(getAttendanceDashboardData);
  const getClassroomFn = useServerFn(getCachedClassroomTasks);
  const createThreadFn = useServerFn(createThread);

  const { data: attendanceData, isLoading } = useQuery({
    queryKey: ["attendanceDashboardData"],
    queryFn: () => getAttendanceFn(),
    retry: 1,
  });

  const { data: classroomData } = useQuery({
    queryKey: ["classroomTasksCached"],
    queryFn: () => getClassroomFn(),
    retry: 1,
  });

  const [sessionUser, setSessionUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (session?.user) {
        const u = session.user;
        const meta = u.user_metadata || {};
        const name = meta.full_name || meta.name || u.email?.split("@")[0] || "Student";
        const email = u.email || "";
        setSessionUser({ name, email });
      }
    });
  }, []);

  const overallAttendance = attendanceData?.overall?.percentage ?? null;
  const activeCourses = attendanceData?.subjects?.length ?? 0;
  const atRiskSubjects = attendanceData?.subjects?.filter((s) => s.percentage < 85) ?? [];

  const upcomingTasks = (classroomData?.assignments ?? [])
    .filter((a) => a.state !== "SUBMITTED")
    .slice(0, 5);
  const pendingCount = (classroomData?.assignments ?? []).filter((a) => a.state === "PENDING").length;
  const overdueCount = (classroomData?.assignments ?? []).filter((a) => a.state === "OVERDUE").length;

  // GSAP animations
  useEffect(() => {
    if (!isLoading && dashboardRef.current) {
      gsap.fromTo(
        ".bento-card",
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, stagger: 0.05, ease: "power2.out", clearProps: "transform" }
      );

      if (attendanceNumberRef.current && overallAttendance !== null) {
        const counterObj = { val: 0 };
        gsap.to(counterObj, {
          val: overallAttendance,
          duration: 1.0,
          ease: "power2.out",
          onUpdate: () => {
            if (attendanceNumberRef.current) attendanceNumberRef.current.innerText = counterObj.val.toFixed(1);
          },
        });
      }
    }
  }, [isLoading, overallAttendance]);

  const department = sessionUser ? deriveDepartment(sessionUser.email) : "";

  return (
    <ChatLayout activeThreadId={null}>
      <motion.div
        ref={dashboardRef}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="h-full overflow-y-auto bg-background text-foreground p-5 md:p-8"
      >
        <div className="grid gap-6 lg:grid-cols-12 items-start max-w-7xl mx-auto">

          {/* ── Left Column ─────────────────────────────────── */}
          <div className="lg:col-span-8 space-y-5">

            {/* Welcome header */}
            <div className="bento-card rounded-2xl border border-border bg-card/70 backdrop-blur-md p-6 shadow-xs">
              <h1 className="text-xl md:text-2xl font-display font-black tracking-tight text-foreground">
                Welcome back, {sessionUser?.name || "Student"}
              </h1>
              {department && (
                <p className="text-xs text-muted-foreground mt-1">{department}</p>
              )}
            </div>

            {/* Key metric cards — all real, synced data */}
            <div className="grid gap-4 md:grid-cols-3">
              <motion.div
                whileHover={{ y: -2 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="bento-card bg-card/70 border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-foreground" />
                    <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Attendance</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full border border-border bg-muted/60 text-foreground">
                    {overallAttendance !== null ? <><span ref={attendanceNumberRef}>0.0</span>%</> : "—"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 my-4 bg-muted/30 p-3 rounded-xl border border-border/50 text-xs">
                  <div>
                    <p className="text-muted-foreground font-mono text-[9px] uppercase tracking-wider">Status</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: overallAttendance === null ? undefined : overallAttendance >= 75 ? "rgb(5 150 105)" : "var(--brand-red)" }}>
                      {overallAttendance === null ? "Not synced" : overallAttendance >= 75 ? "Safe Margin" : "Low Margin"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-mono text-[9px] uppercase tracking-wider">At Risk</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">{atRiskSubjects.length} Subjects</p>
                  </div>
                </div>
                <Link to="/app/attendance" className="flex items-center justify-between text-xs font-semibold text-foreground hover:opacity-80 group pt-2 border-t border-border/40">
                  <span>Attendance Monitor</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </motion.div>

              <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 25 }} className="bento-card bg-card/70 border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Active Courses</p>
                  <GraduationCap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
                <p className="font-semibold text-2xl text-foreground tracking-tight mt-1">{activeCourses}</p>
                <p className="font-mono text-[9px] text-muted-foreground mt-0.5">{activeCourses > 0 ? "From CUE sync" : "Not synced yet"}</p>
              </motion.div>

              <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 25 }} className="bento-card bg-card/70 border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Assignments</p>
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
                <p className="font-semibold text-2xl text-foreground tracking-tight mt-1">{pendingCount + overdueCount}</p>
                <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                  {overdueCount > 0 ? `${overdueCount} overdue` : "From Classroom sync"}
                </p>
              </motion.div>
            </div>

            {/* Quick Action Studio */}
            <div className="bento-card rounded-2xl border border-border bg-card/70 p-5 shadow-xs">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3.5">Quick Action Studio</p>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {[
                  {
                    label: "AI Study Assistant", desc: "Syllabus Q&A", icon: Sparkles,
                    action: () => createThreadFn({ data: {} }).then((t) => navigate({ to: "/app/$threadId", params: { threadId: t.id } })).catch(() => navigate({ to: "/app/ai-assistant" })),
                  },
                  { label: "File Converter", desc: "PDF/Word/PPT", icon: FileOutput, action: () => navigate({ to: "/app/conversions" }) },
                  { label: "Attendance Ledger", desc: "CUE Live Sync", icon: CheckCircle2, action: () => navigate({ to: "/app/attendance" }) },
                  { label: "Class Community", desc: "DMs & Discussions", icon: Users, action: () => navigate({ to: "/app/community" }) },
                ].map((act, idx) => {
                  const Icon = act.icon;
                  return (
                    <motion.button
                      key={idx}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={act.action}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 hover:bg-muted/50 hover:border-brand-red/30 p-3 text-left transition-all group"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border shadow-xs">
                        <Icon className="h-4 w-4 text-foreground group-hover:scale-110 transition-transform" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground block">{act.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{act.desc}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Subjects at risk — real, from synced attendance */}
            {atRiskSubjects.length > 0 && (
              <div className="bento-card rounded-2xl border border-brand-red/25 bg-brand-red/5 p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="h-4 w-4 text-brand-red" />
                  <p className="text-xs font-bold text-foreground">Subjects needing attention</p>
                </div>
                <div className="space-y-1.5">
                  {atRiskSubjects.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground font-medium">{s.name}</span>
                      <span className="font-mono font-bold text-brand-red">{s.percentage.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right Column ─────────────────────────────────── */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bento-card rounded-2xl border border-border bg-card/70 p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3.5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Upcoming Classroom Tasks</p>
                <Link to="/app/classroom" className="text-[10px] font-semibold text-muted-foreground hover:text-foreground">View all</Link>
              </div>

              {upcomingTasks.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-[11px] text-muted-foreground">
                    {classroomData?.assignments?.length ? "All caught up — nothing pending." : "Connect Google Classroom to see real deadlines here."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingTasks.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl border border-border/50 bg-muted/20">
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                        <p className="font-mono text-[9px] text-muted-foreground truncate">{item.courseName}</p>
                      </div>
                      <span className={`shrink-0 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-md border ml-2 ${
                        item.state === "OVERDUE"
                          ? "bg-brand-red/10 border-brand-red/25 text-brand-red"
                          : "bg-muted border-border/60 text-foreground"
                      }`}>
                        {item.dueDate ? new Date(item.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "No due date"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </motion.div>
    </ChatLayout>
  );
}

export default AppIndex;
