import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { getAnalyticsSummary, updateProfile } from "@/lib/analytics.functions";
import { getAttendanceDashboardData } from "@/lib/attendance.functions";
import { createThread } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";
import gsap from "gsap";
import {
  BookOpen,
  Calendar as CalendarIcon,
  FileCheck2,
  ArrowRight,
  Sparkles,
  Flame,
  GraduationCap,
  CheckCircle2,
  RefreshCw,
  Send,
  Clock,
  Zap,
  FileOutput,
  Users,
  Layers,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";

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

// Fallback analytics state in case of network or initial hydration delays
const DEFAULT_ANALYTICS = {
  profile: {
    fullName: "Student",
    degree: "MSc Big Data Analytics",
    semester: "Semester 4",
    targetRole: "Software Engineer",
    skills: ["Python", "SQL", "Machine Learning"],
    examDates: new Date().toISOString(),
  },
  studentMetrics: null,
  stats: {
    currentStreak: 12,
    longestStreak: 21,
    studyHoursThisWeek: 14.5,
    studyHoursThisMonth: 42.0,
    totalStudyHours: 128.0,
    placementReadiness: 78,
    learningVelocity: 1.2,
    skillsAddedThisMonth: 3,
    velocityTrend: "Increasing",
  },
  placementBreakdown: { resume: 82, skills: 75, projects: 80, interview: 85, learningProgress: 70 },
  roadmap: { completed: 8, total: 12, percentage: 67 },
  subjectDistribution: [{ name: "Theory", value: 60 }, { name: "Lab", value: 40 }],
  subjectPerformance: [
    { name: "DBMS", coverage: 85, readiness: 82, revision: "Ready" },
    { name: "Operating Systems", coverage: 70, readiness: 65, revision: "Needs Revision" },
    { name: "Computer Networks", coverage: 92, readiness: 88, revision: "Ready" },
  ],
  examReadiness: { score: 85, status: "Ready" },
  skillsTimeline: [{ month: "January", skill: "Python" }, { month: "February", skill: "SQL" }, { month: "March", skill: "React" }],
  heatmapData: {},
  insights: ["Your academic tracking is online. Keep steady consistency!"],
  predictions: { placementReadiness30Days: 85, expectedDate: "July 2026", roadmapCompletionProbability: 90, skillGrowthForecast: "+3 Skills" },
  achievements: [],
  studentSuccessScore: 82,
};

function AppIndex() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const successNumberRef = useRef<HTMLSpanElement>(null);
  const attendanceNumberRef = useRef<HTMLSpanElement>(null);

  // Server functions
  const getSummaryFn = useServerFn(getAnalyticsSummary);
  const getAttendanceFn = useServerFn(getAttendanceDashboardData);
  const updateProfileFn = useServerFn(updateProfile);
  const createThreadFn = useServerFn(createThread);

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ["analyticsSummary"],
    queryFn: () => getSummaryFn(),
    retry: 1,
  });

  const { data: attendanceData } = useQuery({
    queryKey: ["attendanceDashboardData"],
    queryFn: () => getAttendanceFn(),
    retry: 1,
  });

  const analytics = analyticsData || DEFAULT_ANALYTICS;

  const [isEditing, setIsEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    degree: "",
    semester: "",
    targetRole: "",
    skills: "",
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

  const [aiInput, setAiInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    { sender: "ai", text: "Welcome to your AcadSphere workspace! Ask any question regarding your syllabus, viva prep, or project milestones." }
  ]);

  const profile = analytics.profile;
  const stats = analytics.stats;
  const readiness = stats?.placementReadiness || 78;
  const successScore = Math.round((readiness * 0.6 + (analytics.roadmap.percentage || 67) * 0.2 + (stats?.studyHoursThisWeek || 14.5) * 1.5) / 2);
  const overallAttendance = attendanceData?.overall?.percentage ?? 84;

  // GSAP animations
  useEffect(() => {
    if (!isLoading && dashboardRef.current) {
      gsap.fromTo(
        ".bento-card",
        { y: 15, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.45,
          stagger: 0.04,
          ease: "power2.out",
          clearProps: "transform",
        }
      );

      if (successNumberRef.current) {
        const counterObj = { val: 0 };
        gsap.to(counterObj, {
          val: successScore,
          duration: 1.0,
          ease: "power2.out",
          onUpdate: () => {
            if (successNumberRef.current) {
              successNumberRef.current.innerText = Math.round(counterObj.val).toString();
            }
          },
        });
      }

      if (attendanceNumberRef.current) {
        const counterObj = { val: 0 };
        gsap.to(counterObj, {
          val: overallAttendance,
          duration: 1.0,
          ease: "power2.out",
          onUpdate: () => {
            if (attendanceNumberRef.current) {
              attendanceNumberRef.current.innerText = Math.round(counterObj.val).toString();
            }
          },
        });
      }
    }
  }, [isLoading, successScore, overallAttendance]);

  const startEdit = () => {
    if (analytics.profile) {
      setProfileForm({
        fullName: analytics.profile.fullName,
        degree: analytics.profile.degree,
        semester: analytics.profile.semester,
        targetRole: analytics.profile.targetRole,
        skills: Array.isArray(analytics.profile.skills) ? analytics.profile.skills.join(", ") : "",
      });
      setIsEditing(true);
    }
  };

  const saveProfile = useMutation({
    mutationFn: (data: typeof profileForm) => updateProfileFn({ data }),
    onSuccess: () => {
      toast.success("Academic profile updated");
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ["analyticsSummary"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update profile");
    }
  });

  const handleSendAiMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    const userMsg = aiInput;
    setChatMessages(prev => [...prev, { sender: "user", text: userMsg }]);
    setAiInput("");

    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        { sender: "ai", text: `I've noted: "${userMsg}". Launch an AI Mentoring session for deep syllabus breakdown!` }
      ]);
    }, 600);
  };

  // Study hours trend
  const studyHoursData = [
    { name: "Mon", hours: 2.5 },
    { name: "Tue", hours: 3.8 },
    { name: "Wed", hours: 2.0 },
    { name: "Thu", hours: 4.2 },
    { name: "Fri", hours: 3.0 },
    { name: "Sat", hours: 5.0 },
    { name: "Sun", hours: 3.5 }
  ];

  // Attendance trend
  const attendanceTrendData = [
    { month: "Jan", attendance: 88 },
    { month: "Feb", attendance: 90 },
    { month: "Mar", attendance: 86 },
    { month: "Apr", attendance: 92 },
    { month: "May", attendance: 94 },
    { month: "Jun", attendance: overallAttendance }
  ];

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

          {/* ── Left Column (8 Cols) ─────────────────────────────────── */}
          <div className="lg:col-span-8 space-y-5">

            {/* 1. Bento Card: Welcome & Success Dial Header */}
            <div className="bento-card rounded-2xl border border-border/80 bg-card/70 backdrop-blur-md p-6 shadow-xs">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                      Welcome back, {sessionUser?.name || profile?.fullName || "Student"}
                    </h1>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-border bg-muted/60 text-muted-foreground font-semibold">
                      <Flame className="h-3.5 w-3.5 text-amber-500" />
                      {stats?.currentStreak || 12} Day Streak
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                    {profile?.degree || "MSc Big Data Analytics"} · {profile?.semester || "Semester 4"} · Target: {profile?.targetRole || "Software Engineer"}
                  </p>
                  <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold">Active Sync:</span>
                    <span className="font-medium text-foreground">CUE Portal & Classroom Connected</span>
                  </div>
                </div>

                {/* Circular Success Index */}
                <div className="flex items-center gap-4 shrink-0 bg-muted/30 p-3.5 rounded-2xl border border-border/60">
                  <div className="relative h-14 w-14">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="26" stroke="currentColor" className="text-muted/60" fill="transparent" strokeWidth="4" />
                      <circle
                        cx="32" cy="32" r="26"
                        stroke="currentColor"
                        className="text-foreground"
                        fill="transparent" strokeWidth="4"
                        strokeDasharray={2 * Math.PI * 26}
                        strokeDashoffset={2 * Math.PI * 26 * (1 - successScore / 100)}
                        strokeLinecap="round"
                        style={{ transition: "stroke-dashoffset 1s ease-out" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-bold text-xs text-foreground">
                      <span ref={successNumberRef}>{successScore}</span>%
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-xs text-foreground">Success Index</p>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">Readiness Benchmark</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Key Metric Stat Cards */}
            <div className="grid gap-4 md:grid-cols-3">

              {/* Attendance Card */}
              <motion.div
                whileHover={{ y: -2 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="bento-card bg-card/70 border border-border/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-foreground" />
                    <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Attendance Health
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full border border-border bg-muted/60 text-foreground">
                    <span ref={attendanceNumberRef}>{overallAttendance}</span>%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 my-4 bg-muted/30 p-3 rounded-xl border border-border/50 text-xs">
                  <div>
                    <p className="text-muted-foreground font-mono text-[9px] uppercase tracking-wider">Status</p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {overallAttendance >= 75 ? "Safe Margin" : "Low Margin"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-mono text-[9px] uppercase tracking-wider">At Risk</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">
                      {attendanceData?.overall?.subjectsAtRiskCount ?? 0} Subjects
                    </p>
                  </div>
                </div>

                <Link
                  to="/app/attendance"
                  className="flex items-center justify-between text-xs font-semibold text-foreground hover:opacity-80 group pt-2 border-t border-border/40"
                >
                  <span>Attendance Monitor</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </motion.div>

              {/* Matrix Stat Grid */}
              <div className="bento-card md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Active Courses", value: "5 Subjects", sub: "Classroom Synced", icon: GraduationCap },
                  { label: "Placement Readiness", value: `${readiness}%`, sub: "ATS & Skills", icon: TrendingUp },
                  { label: "Weekly Study", value: `${stats?.studyHoursThisWeek || 14.5} hrs`, sub: "Goal: 15.0h", icon: Clock },
                  { label: "Assignments", value: "2 Pending", sub: "Due this week", icon: CalendarIcon },
                  { label: "Study Consistency", value: "92%", sub: "Top 10% Batch", icon: Zap },
                  { label: "Resume Profiles", value: "3 Versions", sub: "ATS Optimized", icon: FileCheck2 },
                ].map((card, idx) => {
                  const Icon = card.icon;
                  return (
                    <motion.div
                      key={idx}
                      whileHover={{ y: -2 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="bg-card/70 border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between">
                        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{card.label}</p>
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                      <p className="font-semibold text-sm text-foreground tracking-tight mt-1">{card.value}</p>
                      <p className="font-mono text-[9px] text-muted-foreground mt-0.5">{card.sub}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* 3. Quick Action Studio (4 Clean Tiles) */}
            <div className="bento-card rounded-2xl border border-border/80 bg-card/70 p-5 shadow-xs">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3.5">
                Quick Action Studio
              </p>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {[
                  {
                    label: "AI Study Assistant",
                    desc: "Syllabus Q&A",
                    icon: Sparkles,
                    action: () => createThreadFn({ data: {} }).then(t => navigate({ to: "/app/$threadId", params: { threadId: t.id } })).catch(() => navigate({ to: "/app/ai-assistant" }))
                  },
                  {
                    label: "File Converter",
                    desc: "PDF/Word/PPT",
                    icon: FileOutput,
                    action: () => navigate({ to: "/app/conversions" })
                  },
                  {
                    label: "Attendance Ledger",
                    desc: "CUE Live Sync",
                    icon: CheckCircle2,
                    action: () => navigate({ to: "/app/attendance" })
                  },
                  {
                    label: "Class Community",
                    desc: "DMs & Discussions",
                    icon: Users,
                    action: () => navigate({ to: "/app/community" })
                  },
                ].map((act, idx) => {
                  const Icon = act.icon;
                  return (
                    <motion.button
                      key={idx}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={act.action}
                      className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/50 p-3 text-left transition-all group"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border/80 shadow-xs">
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

            {/* 4. Analytics Overview Charts */}
            <div className="bento-card rounded-2xl border border-border/80 bg-card/70 p-6 space-y-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Study Performance</p>
                  <h3 className="font-semibold text-xs text-foreground tracking-tight">Academic Analytics Matrix</h3>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Weekly Study Hours */}
                <div className="space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Weekly Study Distribution (Hours)</p>
                  <div className="h-44 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={studyHoursData}>
                        <defs>
                          <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="currentColor" className="text-foreground" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="currentColor" className="text-foreground" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(113, 113, 122, 0.15)" />
                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ background: "rgba(24, 24, 27, 0.95)", border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: 11 }} />
                        <Area type="monotone" dataKey="hours" stroke="currentColor" className="text-foreground" strokeWidth={2} fillOpacity={1} fill="url(#colorHours)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Monthly Attendance Trend */}
                <div className="space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Monthly Attendance Rate (%)</p>
                  <div className="h-44 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={attendanceTrendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(113, 113, 122, 0.15)" />
                        <XAxis dataKey="month" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis domain={[70, 100]} stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ background: "rgba(24, 24, 27, 0.95)", border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: 11 }} />
                        <Bar dataKey="attendance" fill="currentColor" className="text-foreground" radius={[4, 4, 0, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ── Right Column (4 Cols) ─────────────────────────────────── */}
          <div className="lg:col-span-4 space-y-5">

            {/* AI Assistant Copilot Panel */}
            <div className="bento-card rounded-2xl border border-border/80 bg-card/70 overflow-hidden flex flex-col h-[380px] shadow-xs">
              <div className="px-4 py-3.5 border-b border-border/60 flex items-center justify-between shrink-0 bg-muted/20">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-muted border border-border/70 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">AI Study Copilot</h3>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-emerald-500 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" /> Active
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-muted/10">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col max-w-[88%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-foreground text-background ml-auto rounded-tr-xs shadow-xs"
                        : "bg-card border border-border/80 text-foreground mr-auto rounded-tl-xs shadow-xs"
                    }`}
                  >
                    <span>{msg.text}</span>
                  </div>
                ))}
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendAiMessage} className="p-2.5 border-t border-border/80 bg-card flex gap-2 shrink-0">
                <input
                  type="text"
                  placeholder="Ask a syllabus question..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-border/80 bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                />
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  type="submit"
                  className="h-8 w-8 rounded-xl bg-foreground text-background flex items-center justify-center shadow-xs hover:bg-foreground/90 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </motion.button>
              </form>
            </div>

            {/* Academic Deadlines Calendar */}
            <div className="bento-card rounded-2xl border border-border/80 bg-card/70 p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Course Deadlines</p>
                <span className="font-mono text-[10px] text-muted-foreground">Semester 4</span>
              </div>

              <div className="space-y-2">
                {[
                  { date: "Aug 24", title: "DBMS Project Phase 1", tag: "Major Milestone" },
                  { date: "Aug 28", title: "OS Lab Viva Prep", tag: "Assessment" },
                  { date: "Sep 02", title: "Resume ATS Review", tag: "Career Placement" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-border/50 bg-muted/20">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-foreground">{item.title}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">{item.tag}</p>
                    </div>
                    <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted border border-border/60 text-foreground">
                      {item.date}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile Parameters Card */}
            <div className="bento-card rounded-2xl border border-border/80 bg-card/70 p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Academic Profile</p>
                <button onClick={startEdit} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  {isEditing ? "Editing" : "Edit"}
                </button>
              </div>

              {!isEditing ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground">Student</span>
                    <span className="font-semibold text-foreground">{sessionUser?.name || profile?.fullName || "Student"}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground">Degree</span>
                    <span className="font-semibold text-foreground">{profile?.degree || "MSc Big Data Analytics"}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground">Target Role</span>
                    <span className="font-semibold text-foreground">{profile?.targetRole || "Software Engineer"}</span>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveProfile.mutate(profileForm);
                  }}
                  className="space-y-2.5 pt-1"
                >
                  <input
                    placeholder="Full Name"
                    value={profileForm.fullName}
                    onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-border/80 bg-muted/40 text-foreground"
                    required
                  />
                  <input
                    placeholder="Degree / Major"
                    value={profileForm.degree}
                    onChange={(e) => setProfileForm({ ...profileForm, degree: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-border/80 bg-muted/40 text-foreground"
                    required
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={saveProfile.isPending} className="flex-1 h-7 text-xs bg-foreground text-background hover:bg-foreground/90 rounded-xl">
                      Save
                    </Button>
                    <Button type="button" onClick={() => setIsEditing(false)} variant="outline" className="flex-1 h-7 text-xs rounded-xl">
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>

          </div>

        </div>
      </motion.div>
    </ChatLayout>
  );
}

export default AppIndex;
