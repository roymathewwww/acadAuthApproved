import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import {
  getClassroomSubmissions,
  getCachedClassroomTasks,
  type SubmissionItem,
  type ClassroomResponse,
} from "@/lib/classroom.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles,
  Check,
  ChevronDown,
  Info,
  Calendar,
  X,
  MessageSquare,
  Send,
  Wifi,
  FileCheck,
  ArrowUpRight
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/classroom")({
  head: () => ({
    meta: [
      { title: "Classroom Submissions · AcadSphere" },
      { name: "description", content: "Track pending coursework, deadlines, and grades across all your subjects." },
    ],
  }),
  component: ClassroomPage,
});

function ClassroomPage() {
  const fetchSubmissionsFn = useServerFn(getClassroomSubmissions);
  const fetchCachedTasksFn = useServerFn(getCachedClassroomTasks);
  const queryClient = useQueryClient();

  /* — UI State — */
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "OVERDUE" | "COMPLETED" | "INACTIVE">("ALL");
  const [selectedCourse, setSelectedCourse] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendingDemoSms, setIsSendingDemoSms] = useState(false);
  const [reviewedMap, setReviewedMap] = useState<Record<string, boolean>>({});
  const [showBanner, setShowBanner] = useState(true);
  const [hasToken, setHasToken] = useState<boolean>(
    () => typeof window !== "undefined" && !!localStorage.getItem("google_provider_token")
  );
  const tokenCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll localStorage briefly after mount to catch the token
  useEffect(() => {
    if (hasToken) return;
    let attempts = 0;
    tokenCheckRef.current = setInterval(() => {
      attempts++;
      const tok = typeof window !== "undefined" ? localStorage.getItem("google_provider_token") : null;
      if (tok) {
        setHasToken(true);
        clearInterval(tokenCheckRef.current!);
      } else if (attempts >= 20) {
        clearInterval(tokenCheckRef.current!);
      }
    }, 500);
    return () => {
      if (tokenCheckRef.current) clearInterval(tokenCheckRef.current);
    };
  }, [hasToken]);

  /* — Optimistic Cache Query — */
  const { data: cachedData } = useQuery<ClassroomResponse>({
    queryKey: ["classroomCache"],
    queryFn: () => fetchCachedTasksFn() as Promise<ClassroomResponse>,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  /* — Live GCR Fetch — */
  const { data: liveData, isLoading: isLiveLoading, refetch } = useQuery<ClassroomResponse>({
    queryKey: ["classroomSubmissions", hasToken],
    queryFn: async () => {
      let googleToken =
        typeof window !== "undefined"
          ? (localStorage.getItem("google_provider_token") || undefined)
          : undefined;

      if (!googleToken) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.provider_token) {
            googleToken = session.provider_token;
            if (typeof window !== "undefined") {
              localStorage.setItem("google_provider_token", session.provider_token);
              setHasToken(true);
            }
          }
        } catch (_) {}
      }

      return fetchSubmissionsFn({ data: { providerToken: googleToken } }) as Promise<ClassroomResponse>;
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    placeholderData: cachedData,
  });

  const data = liveData ?? cachedData;
  const isShowingCache = !liveData && !!cachedData?.assignments?.length;
  const isLoading = isLiveLoading && !cachedData?.assignments?.length;
  const isBackgroundRefreshing = isLiveLoading && !!cachedData?.assignments?.length;

  const isConnected = liveData?.connected ?? false;
  const assignments = data?.assignments ?? [];

  const syncTasksToDb = async (items: SubmissionItem[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const pendingItems = items.filter(
        (a) => a.state === "PENDING" || a.state === "OVERDUE"
      );
      if (pendingItems.length === 0) return;

      const rows = pendingItems.map((a) => ({
        user_id:       user.id,
        coursework_id: a.id,
        title:         a.title,
        course_name:   a.courseName || "",
        due_date:      a.dueDate ? new Date(a.dueDate).toISOString() : null,
        status:        "PENDING" as const,
      }));

      await supabase
        .from("classroom_tasks")
        .upsert(rows, {
          onConflict: "user_id,coursework_id",
          ignoreDuplicates: false,
        });
    } catch (_) {}
  };

  const handleSync = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["classroomSubmissions"] });
      const result = await refetch();

      if (result.data?.assignments) {
        await syncTasksToDb(result.data.assignments);
        await queryClient.invalidateQueries({ queryKey: ["classroomCache"] });
      }

      toast.success("Classroom coursework synchronized!");
    } catch (err: any) {
      toast.error("Sync failed: " + (err?.message || "Could not reach Google Classroom."));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDemoSms = async () => {
    setIsSendingDemoSms(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let phone: string | undefined;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone_number")
          .eq("id", user.id)
          .single();
        phone = profile?.phone_number || undefined;
      }

      const userName = user?.user_metadata?.full_name?.split(" ")[0]
        || user?.email?.split("@")[0]
        || "Student";

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-demo-sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          pending: counts.pending,
          overdue: counts.overdue,
          completed: counts.completed,
          total: counts.total,
          courses: counts.courses,
          phone,
          userName,
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success("Demo SMS alert sent to phone!");
      } else {
        toast.error("SMS notification failed: " + (result.error || "Unknown error"));
      }
    } catch (err: any) {
      toast.error("Failed to send Demo SMS: " + err.message);
    } finally {
      setIsSendingDemoSms(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      toast.info("Connecting to Google Classroom...");
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes:
            "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me",
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "consent",
            access_type: "offline",
          },
        },
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate Google OAuth");
    }
  };

  const toggleReviewed = (id: string) => {
    setReviewedMap((prev) => {
      const nextState = !prev[id];
      if (nextState) toast.success("Coursework marked as reviewed");
      return { ...prev, [id]: nextState };
    });
  };

  const coursesList = useMemo(() => {
    const activeSet = new Set<string>();
    const inactiveSet = new Set<string>();

    if (data?.courses) {
      for (const c of data.courses) {
        if (c.name) {
          if (c.isCurrentSemester !== false) activeSet.add(c.name);
          else inactiveSet.add(c.name);
        }
      }
    }
    for (const item of assignments) {
      if (item.courseName) {
        if (item.isCurrentSemester !== false) activeSet.add(item.courseName);
        else inactiveSet.add(item.courseName);
      }
    }

    if (activeTab === "INACTIVE") return Array.from(inactiveSet);
    return Array.from(activeSet);
  }, [assignments, data?.courses, activeTab]);

  const counts = useMemo(() => {
    let overdue = 0;
    let pending = 0;
    let completed = 0;
    let inactive = 0;

    const activeAssignments = assignments.filter((item) => item.isCurrentSemester !== false);
    const inactiveAssignments = assignments.filter((item) => item.isCurrentSemester === false);

    for (const item of activeAssignments) {
      if (item.state === "OVERDUE") overdue++;
      else if (item.state === "PENDING") pending++;
      else if (item.state === "SUBMITTED" || item.state === "GRADED") completed++;
    }

    inactive = inactiveAssignments.length;

    let activeSubjectsCount = data?.coursesCount ?? 0;
    if (data?.courses && data.courses.length > 0) {
      activeSubjectsCount = data.courses.filter((c) => c.isCurrentSemester !== false).length;
    } else if (isShowingCache) {
      activeSubjectsCount = new Set(activeAssignments.map((a) => a.courseName).filter(Boolean)).size;
    }

    return {
      total: activeAssignments.length,
      overdue,
      pending,
      completed,
      inactive,
      courses: activeSubjectsCount,
    };
  }, [assignments, data, isShowingCache]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      if (activeTab === "INACTIVE") {
        if (item.isCurrentSemester !== false) return false;
      } else {
        if (item.isCurrentSemester === false) return false;
      }

      if (activeTab === "PENDING" && item.state !== "PENDING") return false;
      if (activeTab === "OVERDUE" && item.state !== "OVERDUE") return false;
      if (activeTab === "COMPLETED" && item.state !== "SUBMITTED" && item.state !== "GRADED") return false;

      if (selectedCourse !== "ALL" && item.courseName !== selectedCourse) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchCourse = item.courseName.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q) ?? false;
        if (!matchTitle && !matchCourse && !matchDesc) return false;
      }

      return true;
    });
  }, [assignments, activeTab, selectedCourse, searchQuery]);

  return (
    <ChatLayout activeThreadId={null}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 md:p-8 space-y-6 max-w-7xl mx-auto"
      >
        {/* ─── Top Header ────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <motion.div
                whileHover={{ rotate: -8, scale: 1.08 }}
                className="h-8 w-8 rounded-xl bg-brand-red text-brand-red-foreground flex items-center justify-center shadow-xs"
              >
                <GraduationCap className="h-4 w-4" />
              </motion.div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Classroom Coursework Ledger
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Track pending assignments, milestones, and grading across enrolled subjects.
              </p>
              {isBackgroundRefreshing ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                  <Wifi className="h-2.5 w-2.5" />
                  Syncing…
                </span>
              ) : isConnected ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                  Connected
                </span>
              ) : isShowingCache ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">
                  Cached
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleSync}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-brand-red/30 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors shadow-xs disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-brand-red" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync Live"}</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              id="demo-sms-btn"
              onClick={handleDemoSms}
              disabled={isSendingDemoSms}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-brand-red text-brand-red-foreground text-xs font-semibold hover:opacity-90 shadow-sm shadow-brand-red/20 transition-[opacity,box-shadow] disabled:opacity-70"
            >
              {isSendingDemoSms ? (
                <Send className="h-3.5 w-3.5 animate-bounce" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )}
              <span>{isSendingDemoSms ? "Sending..." : "SMS Alert"}</span>
            </motion.button>

            {!isConnected && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleConnectGoogle}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-brand-gold text-brand-gold-foreground text-xs font-semibold hover:opacity-90 shadow-sm shadow-brand-gold/20 transition-[opacity,box-shadow]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Connect Google</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* ─── Metric Matrix ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            { label: "Action Needed", count: counts.overdue, desc: "Overdue Submissions", icon: AlertTriangle, color: "text-brand-red" },
            { label: "Due Soon", count: counts.pending, desc: "Pending Coursework", icon: Clock, color: "text-amber-500" },
            { label: "Turned In", count: counts.completed, desc: "Submitted / Graded", icon: CheckCircle2, color: "text-emerald-500" },
            { label: "Enrolled Courses", count: counts.courses, desc: "Active Classroom Subjects", icon: BookOpen, color: "text-brand-gold" },
          ].map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={idx}
                whileHover={{ y: -3, scale: 1.015 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 hover:border-brand-red/30 bg-white/90 dark:bg-zinc-900/90 p-4 shadow-xs flex flex-col justify-between transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-wider font-semibold text-zinc-400">
                    {card.label}
                  </span>
                  <Icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{card.count}</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{card.desc}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ─── Filter Tabs & Search Bar ───────────────────────────────── */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white/90 dark:bg-zinc-900/90 p-2 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none p-0.5">
            {[
              { id: "ALL", label: `Active (${counts.total})` },
              { id: "PENDING", label: `Pending (${counts.pending})` },
              { id: "OVERDUE", label: `Overdue (${counts.overdue})` },
              { id: "COMPLETED", label: `Completed (${counts.completed})` },
              { id: "INACTIVE", label: `Past (${counts.inactive})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSelectedCourse("ALL");
                }}
                className={`relative px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 hover:scale-[1.03] active:scale-[0.97] ${
                  activeTab === tab.id
                    ? "bg-brand-red text-brand-red-foreground shadow-sm shadow-brand-red/20"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Course Filter */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative shrink-0">
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="appearance-none bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 pr-8 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all"
              >
                <option value="ALL">All Subjects</option>
                {coursesList.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Filter coursework..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all"
              />
            </div>
          </div>
        </div>

        {/* ─── Submissions List / Grid with Framer Motion Layout ──────── */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/90 dark:bg-zinc-900/90 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 text-center shadow-xs">
            <div className="h-12 w-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-6 w-6 text-zinc-900 dark:text-zinc-100" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {!isConnected && !isShowingCache ? "Connect Google Classroom" : "No assignments found"}
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              {!isConnected && !isShowingCache
                ? "Authorize your Google account above to load live deadlines and coursework."
                : "No coursework matches the active search and filter settings."}
            </p>
          </div>
        ) : (
          <motion.div layout className="space-y-3">
            <AnimatePresence>
              {filteredAssignments.map((item) => {
                const isOverdue = item.state === "OVERDUE";
                const isSubmitted = item.state === "SUBMITTED";
                const isGraded = item.state === "GRADED";
                const isReviewed = reviewedMap[item.id] ?? false;

                let dueDisplay = "No Due Date";
                if (item.dueDate) {
                  const d = new Date(item.dueDate);
                  dueDisplay = d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                }

                return (
                  <motion.div
                    layout
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    whileHover={{ y: -2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className={`group relative rounded-2xl border p-4 md:p-5 bg-white/90 dark:bg-zinc-900/90 transition-all shadow-xs ${
                      isOverdue
                        ? "border-brand-red/40 bg-brand-red/5"
                        : isReviewed
                        ? "opacity-60 border-zinc-200 dark:border-zinc-800"
                        : "border-zinc-200/80 dark:border-zinc-800/80 hover:border-brand-red/30"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">

                      {/* Left Coursework Details */}
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            {item.courseName}
                          </span>

                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-red/10 text-brand-red border border-brand-red/25">
                              <AlertTriangle className="h-3 w-3" />
                              Missing / Overdue
                            </span>
                          )}
                          {item.state === "PENDING" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <Clock className="h-3 w-3" />
                              Pending Submission
                            </span>
                          )}
                          {isSubmitted && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3" />
                              Turned In
                            </span>
                          )}
                          {isGraded && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                              <Sparkles className="h-3 w-3" />
                              Graded
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                          {item.title}
                        </h3>

                        {item.description && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">
                            {item.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-0.5">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                            <span>Due: <strong className="text-zinc-800 dark:text-zinc-200 font-medium">{dueDisplay}</strong></span>
                          </div>

                          {item.maxPoints != null && (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
                                {isGraded && item.grade != null
                                  ? `Score: ${item.grade}/${item.maxPoints} pts`
                                  : `${item.maxPoints} pts possible`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Quick Actions */}
                      <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start gap-2 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800">
                        <motion.a
                          whileTap={{ scale: 0.96 }}
                          href={item.alternateLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 text-xs font-semibold shadow-xs hover:opacity-90 transition-opacity"
                        >
                          <span>Open in GCR</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </motion.a>

                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={() => toggleReviewed(item.id)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                            isReviewed
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                              : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>{isReviewed ? "Reviewed" : "Mark Reviewed"}</span>
                        </motion.button>
                      </div>

                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>
    </ChatLayout>
  );
}
export default ClassroomPage;
