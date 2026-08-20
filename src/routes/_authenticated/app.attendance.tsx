import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calculateAttendanceMargins, marginLabel, marginColor } from "@/lib/attendance-margins";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";
import {
  getAttendanceDashboardData,
  updateSubjectAttendance,
  markNotificationRead,
  deleteNotification,
  syncAttendanceToLocalDb,
  SubjectAttendance,
} from "@/lib/attendance.functions";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Sparkles,
  Bell,
  BellRing,
  Trash2,
  Check,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Minus,
  RefreshCw,
  Layers,
  Lock,
  Eye,
  EyeOff,
  Globe,
  X,
  Wifi,
  WifiOff,
  Database,
  Zap,
  FlaskConical,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/attendance")({
  component: AttendancePage,
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface CueSubject {
  name: string;
  code: string;
  type: string;
  attended: number;
  total: number;
  percentage: number;
}

const CUE_SESSION_KEY = "cue_attendance_v1";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

// ── Component ──────────────────────────────────────────────────────────────────

function AttendancePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dashboard" | "simulator" | "notifications" | "faculty">("dashboard");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("sub1");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSupabaseFetching, setIsSupabaseFetching] = useState(true);
  const [isCueSyncing, setIsCueSyncing] = useState(false);
  const [cueUsername, setCueUsername] = useState("");
  const [cuePassword, setCuePassword] = useState("");
  const [showCuePassword, setShowCuePassword] = useState(false);
  const [cueError, setCueError] = useState<string | null>(null);
  const [showCredentialForm, setShowCredentialForm] = useState(true);
  const [syncTab, setSyncTab] = useState<"server" | "extension" | "bookmarklet">("server");

  // ── CAPTCHA & Server-Side Session State ─────────────────────────────────────
  interface CaptchaSession {
    reachable: boolean;
    hasCaptcha: boolean;
    captchaImage: string | null;
    formActionUrl: string;
    sessionCookie: string;
    codeVerifier: string;
    state: string;
  }

  const [captchaSession, setCaptchaSession] = useState<CaptchaSession | null>(null);
  const [isFetchingSession, setIsFetchingSession] = useState(false);
  const [captchaText, setCaptchaText] = useState("");

  const [userId, setUserId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("demo_user_id") || "fa0beb35-7eec-482c-af0b-596dadeb0b79";
    }
    return "fa0beb35-7eec-482c-af0b-596dadeb0b79";
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setUserId(data.user.id);
      setIsSupabaseFetching(false); // stop loader
    });
  }, []);

  // ── Supabase live fetch from student_attendance table ─────────────────────
  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    setIsSupabaseFetching(true);
    supabase
      .from("student_attendance")
      .select("*")
      .eq("user_id", userId)
      .order("last_synced_at", { ascending: false })
      .then(({ data, error }) => {
        setIsSupabaseFetching(false);
        if (error) {
          console.error("[Attendance] Supabase fetch error:", error.message);
          return;
        }
        if (data && data.length > 0) {
          const mapped: CueSubject[] = data.map((row: any) => ({
            code: row.subject_code,
            name: row.subject_name,
            type: row.subject_type || "Theory",
            attended: row.attended_classes,
            total: row.total_classes,
            percentage: row.percentage,
          }));
          setCueData(mapped);
          setCueLastSynced(data[0].last_synced_at || new Date().toISOString());
          if (typeof window !== "undefined") {
            sessionStorage.setItem(CUE_SESSION_KEY, JSON.stringify({ subjects: mapped, lastSynced: data[0].last_synced_at }));
          }
        }
      });

    // Real-time subscription — fires instantly when CUE extension upserts rows
    const channel = supabase
      .channel(`attendance-live-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "student_attendance",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Re-fetch all subjects on any change
          supabase
            .from("student_attendance")
            .select("*")
            .eq("user_id", userId)
            .order("last_synced_at", { ascending: false })
            .then(({ data }) => {
              if (data && data.length > 0) {
                const mapped: CueSubject[] = data.map((row: any) => ({
                  code: row.subject_code,
                  name: row.subject_name,
                  type: row.subject_type || "Theory",
                  attended: row.attended_classes,
                  total: row.total_classes,
                  percentage: row.percentage,
                }));
                setCueData(mapped);
                setCueLastSynced(new Date().toISOString());
                toast.success(`Attendance synced! ${mapped.length} subjects updated in real-time.`);
              }
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // CUE data cached in sessionStorage (fallback if Supabase hasn't loaded yet)
  // NOTE: must guard with typeof window check — this initializer runs during SSR on Node.js
  const [cueData, setCueData] = useState<CueSubject[] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const s = sessionStorage.getItem(CUE_SESSION_KEY);
      return s ? JSON.parse(s).subjects : null;
    } catch { return null; }
  });
  const [cueLastSynced, setCueLastSynced] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const s = sessionStorage.getItem(CUE_SESSION_KEY);
      return s ? JSON.parse(s).lastSynced : null;
    } catch { return null; }
  });

  const [showCueModal, setShowCueModal] = useState(false);


  // ── Purge sessionStorage when tab closes ──
  useEffect(() => {
    const purge = () => sessionStorage.removeItem(CUE_SESSION_KEY);
    window.addEventListener("beforeunload", purge);
    return () => window.removeEventListener("beforeunload", purge);
  }, []);


  // ── Server functions (for manual attendance tracking & notifications) ───────
  const getDashboardFn = useServerFn(getAttendanceDashboardData);
  const syncAttendanceFn = useServerFn(syncAttendanceToLocalDb);
  const updateAttendanceFn = useServerFn(updateSubjectAttendance);
  const markReadFn = useServerFn(markNotificationRead);
  const deleteNotifFn = useServerFn(deleteNotification);

  const { data: dashboardData, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ["attendanceDashboardData", userId],
    queryFn: () => getDashboardFn({ data: { userId } }),
    retry: 2,
    retryDelay: 1000,
    // No auto-poll — Supabase realtime subscription handles live CUE sync updates
    refetchInterval: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ subjectId, action }: { subjectId: string; action: "present" | "absent" | "reset" }) =>
      updateAttendanceFn({ data: { subjectId, action } }),
    onSuccess: (res) => {
      toast.success(`Updated ${res.subjectName}! New: ${res.newPercentage}%`);
      qc.invalidateQueries({ queryKey: ["attendanceDashboardData"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update attendance"),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markReadFn({ data: { notificationId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendanceDashboardData"] }),
  });

  const deleteNotifMutation = useMutation({
    mutationFn: (id: string) => deleteNotifFn({ data: { notificationId: id } }),
    onSuccess: () => {
      toast.success("Notification removed.");
      qc.invalidateQueries({ queryKey: ["attendanceDashboardData"] });
    },
  });

  const handleCueClear = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(CUE_SESSION_KEY);
    }
    setCueData(null);
    setCueLastSynced(null);
    toast.info("CUE Portal session data cleared.");
  };

  // ── CAPTCHA Session Fetcher ────────────────────────────────────────────────
  const fetchCaptchaSession = async () => {
    setIsFetchingSession(true);
    setCueError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-captcha`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "apikey": SUPABASE_ANON_KEY,
        },
      });
      const data = await res.json();
      if (!data.reachable) {
        setCaptchaSession({
          reachable: false,
          hasCaptcha: false,
          captchaImage: null,
          formActionUrl: "",
          sessionCookie: "",
          codeVerifier: "",
          state: "",
        });
        setCueError(data.error || "Server cannot reach Christ University login portal (port 8010 is blocked).");
      } else if (data.success) {
        setCaptchaSession(data);
        setCaptchaText("");
        if (data.hasCaptcha) {
          toast.info("CAPTCHA required by portal. Please solve it below.");
        }
      } else {
        setCueError(data.error || "Failed to initialize login session.");
      }
    } catch (err: any) {
      setCueError(err?.message || "Failed to contact sync service.");
    } finally {
      setIsFetchingSession(false);
    }
  };

  // Fetch session automatically when modal opens
  useEffect(() => {
    if (showCueModal && syncTab === "server" && !captchaSession && !isFetchingSession) {
      fetchCaptchaSession();
    }
  }, [showCueModal, syncTab]);

  // ── Server-Side CUE Sync Pipeline (CAPTCHA-Aware) ──────────────────────────
  const handleCueSync = async (username: string, password: string) => {
    if (!username || !password) return;
    if (captchaSession?.hasCaptcha && !captchaText.trim()) {
      setCueError("Please enter the CAPTCHA text.");
      toast.error("Please enter the CAPTCHA code.");
      return;
    }

    setIsCueSyncing(true);
    setCueError(null);

    try {
      const payload: any = {
        username: username.trim(),
        password,
        user_id: userId,
      };

      if (captchaSession?.reachable) {
        payload.formActionUrl = captchaSession.formActionUrl;
        payload.sessionCookie = captchaSession.sessionCookie;
        payload.codeVerifier = captchaSession.codeVerifier;
        payload.state = captchaSession.state;
        if (captchaText.trim()) {
          payload.captchaText = captchaText.trim();
        }
      }

      // Phase 1: Authenticate + scrape via kp-scraper edge function (Keycloak Form/PKCE + ESPRO)
      const kpRes = await fetch(`${SUPABASE_URL}/functions/v1/kp-scraper`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      });

      const kpData = await kpRes.json();

      if (!kpData.success) {
        const msg = kpData.error || "Failed to fetch attendance from CUE portal.";
        setCueError(msg);

        if (kpData.isCaptchaError) {
          toast.error("Invalid CAPTCHA code. Loading a new CAPTCHA...");
          fetchCaptchaSession();
        } else if (kpData.isCredentialError) {
          toast.error("Invalid credentials — check your CUE username/password.");
        } else {
          toast.error(msg);
        }
        return;
      }

      if (!kpData.subjects || kpData.subjects.length === 0) {
        setCueError("No attendance data returned. Please try again later.");
        toast.error("No attendance data found on the CUE portal.");
        return;
      }

      // Persist directly into local database
      try {
        await syncAttendanceFn({ data: { userId, subjects: kpData.subjects } });
        qc.invalidateQueries({ queryKey: ["attendanceDashboardData"] });
        refetch();
      } catch (saveErr) {
        console.warn("[app.attendance] Error saving to local DB:", saveErr);
      }

      toast.success(`Synced ${kpData.count || kpData.subjects.length} subjects from CUE Portal!`);

      // Phase 3: Optimistic UI update (Supabase realtime will also fire)
      const mapped: CueSubject[] = kpData.subjects.map((sub: any) => ({
        code: sub.code,
        name: sub.name,
        type: sub.type || "Theory",
        attended: sub.attended,
        total: sub.total,
        percentage: sub.percentage,
      }));
      setCueData(mapped);
      const syncedAt = new Date().toISOString();
      setCueLastSynced(syncedAt);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(CUE_SESSION_KEY, JSON.stringify({ subjects: mapped, lastSynced: syncedAt }));
      }
      setShowCueModal(false);
      setCueUsername("");
      setCuePassword("");
      setCaptchaText("");
      setCueError(null);
    } catch (err: any) {
      const msg = err?.message || "Sync failed. Please try again.";
      setCueError(msg);
      toast.error(msg);
    } finally {
      setIsCueSyncing(false);
    }
  };

  const handleDemoSync = () => handleCueSync("demo", "demo");

  const lastSyncedLabel = useMemo(() => {
    if (!cueLastSynced) return null;
    const diff = Math.floor((Date.now() - new Date(cueLastSynced).getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)}h ago`;
  }, [cueLastSynced]);

  // ── Computed CUE overall margins ──────────────────────────────────────────────
  const cueOverall = useMemo(() => {
    if (!cueData || cueData.length === 0) return null;
    const totalAttended = cueData.reduce((s, sub) => s + sub.attended, 0);
    const totalTotal = cueData.reduce((s, sub) => s + sub.total, 0);
    return {
      attended: totalAttended,
      total: totalTotal,
      pct: totalTotal > 0 ? (totalAttended / totalTotal) * 100 : 100,
      margins: calculateAttendanceMargins(totalAttended, totalTotal),
    };
  }, [cueData]);

  // ── Color helpers ─────────────────────────────────────────────────────────────
  const getBadgeStyle = (color: "green" | "blue" | "yellow" | "red") => {
    switch (color) {
      case "green": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "blue":  return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "yellow":return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "red":   return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse";
    }
  };

  const getProgressColor = (color: "green" | "blue" | "yellow" | "red") => {
    switch (color) {
      case "green":  return "bg-emerald-500";
      case "blue":   return "bg-blue-500";
      case "yellow": return "bg-amber-500";
      case "red":    return "bg-red-500";
    }
  };

  const pctColor = (pct: number) => {
    if (pct >= 85) return "text-emerald-600 dark:text-emerald-400";
    if (pct >= 75) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const pctBadge = (pct: number) => {
    if (pct >= 85) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (pct >= 75) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
  };

  // ── Subject card — margin footer ──────────────────────────────────────────────
  const MarginFooter = ({ attended, total }: { attended: number; total: number }) => {
    const m = calculateAttendanceMargins(attended, total);
    const c85 = marginColor(m.target85, 85);
    const c75 = marginColor(m.target75, 75);
    return (
      <div className="space-y-1.5 p-2.5 rounded-xl bg-muted/30 border border-border/60">
        {/* 85% row */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-emerald-500" /> 85% Target
          </span>
          <span className={`font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border ${c85.text} ${c85.bg} ${c85.border}`}>
            {m.target85.status === "SAFE" ? (
              <><Check className="h-2.5 w-2.5" /> Can skip {m.target85.leavesAllowed} hr{m.target85.leavesAllowed !== 1 ? "s" : ""}</>
            ) : (
              <><AlertTriangle className="h-2.5 w-2.5" /> Attend {m.target85.classesNeeded} hr{m.target85.classesNeeded !== 1 ? "s" : ""}</>
            )}
          </span>
        </div>
        {/* 75% row */}
        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/40">
          <span className="font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <ShieldAlert className="h-3 w-3 text-amber-500" /> 75% Target
          </span>
          <span className={`font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border ${c75.text} ${c75.bg} ${c75.border}`}>
            {m.target75.status === "SAFE" ? (
              <><Check className="h-2.5 w-2.5" /> Can skip {m.target75.leavesAllowed} hr{m.target75.leavesAllowed !== 1 ? "s" : ""}</>
            ) : (
              <><AlertTriangle className="h-2.5 w-2.5" /> Attend {m.target75.classesNeeded} hr{m.target75.classesNeeded !== 1 ? "s" : ""}</>
            )}
          </span>
        </div>
      </div>
    );
  };

  // ── Render CUE Sync Banner (server-side, no extension required) ──────────────
  const renderExtensionSyncBanner = () => (
    <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl border border-border bg-card flex items-center justify-center shrink-0">
            <Globe className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-foreground">Sync Live Attendance from CUE Portal</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Enter your Christ University credentials to fetch live attendance from{" "}
              <strong>cue.christuniversity.in</strong> — no extension required.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider shrink-0 hidden sm:inline-block">
          Server Sync
        </span>
      </div>
      <button
        type="button"
        onClick={() => setShowCueModal(true)}
        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[.98]"
      >
        <Zap className="h-4 w-4" />
        Sync Attendance Now
      </button>
    </div>
  );

  // ── CASE 1: Still fetching — show skeleton loader ────────────────────────────
  if (isLoading || isSupabaseFetching) {
    return (
      <ChatLayout activeThreadId={null}>
        <div className="h-full bg-background flex flex-col overflow-y-auto">
          {/* Skeleton header */}
          <div className="px-6 py-5 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-muted animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-48 bg-muted rounded-lg animate-pulse" />
                <div className="h-3 w-64 bg-muted/60 rounded-lg animate-pulse" />
              </div>
            </div>
          </div>
          {/* Skeleton body */}
          <div className="p-6 space-y-4">
            <div className="h-3 w-56 bg-muted/60 rounded animate-pulse" />
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-muted/40 border border-border animate-pulse" />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-44 rounded-2xl bg-muted/30 border border-border animate-pulse" />
              ))}
            </div>
            <p className="text-[11px] text-center text-muted-foreground animate-pulse font-mono">
              Fetching live attendance from Supabase...
            </p>
          </div>
        </div>
      </ChatLayout>
    );
  }

  // ── CASE 2: Query failed or no data — show error banner + CUE portal usable ──
  if (isError || !dashboardData) {
    const errMsg = (queryError as any)?.message || "Could not load attendance data from the database.";
    return (
      <ChatLayout activeThreadId={null}>
        <div className="h-full bg-background text-foreground flex flex-col overflow-y-auto">
          {/* Error banner */}
          <div className="m-6 p-5 rounded-2xl border border-red-500/30 bg-red-500/5 flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-extrabold text-foreground">Attendance Database Unavailable</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{errMsg}</p>
              <p className="text-xs text-muted-foreground mt-1">You can still sync live data directly from the CUE/KP Portal below.</p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 px-3 py-1.5 rounded-xl hover:bg-primary/10 transition-all shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>

          {/* CUE portal section still fully usable */}
          <div className="px-6 pb-6 space-y-6">
            {cueData && cueOverall ? (
              <>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 rounded-xl">
                  <Wifi className="h-4 w-4" />
                  CUE Portal data loaded · {cueData.length} subjects · {lastSyncedLabel}
                  <button onClick={handleCueClear} className="ml-auto text-muted-foreground hover:text-red-500"><WifiOff className="h-3.5 w-3.5" /></button>
                </div>
                {/* CUE overall summary */}
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-border bg-card shadow-sm">
                    <CardHeader className="pb-2 pt-4">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">Overall (CUE)</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className={`text-3xl font-extrabold ${pctColor(cueOverall.pct)}`}>{cueOverall.pct.toFixed(2)}%</span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">{cueOverall.attended} attended / {cueOverall.total} total hrs</CardContent>
                  </Card>
                  <Card className="border-border bg-card shadow-sm">
                    <CardHeader className="pb-2 pt-4">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">85% Target</span>
                      <CardTitle className={`text-xl font-extrabold mt-1 ${cueOverall.margins.target85.status === "SAFE" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {cueOverall.margins.target85.status === "SAFE" ? `Skip ${cueOverall.margins.target85.leavesAllowed} hrs` : `Need ${cueOverall.margins.target85.classesNeeded} hrs`}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">{cueOverall.margins.target85.status === "SAFE" ? "Above 85% target" : "Below 85% — attend to recover"}</CardContent>
                  </Card>
                  <Card className="border-border bg-card shadow-sm">
                    <CardHeader className="pb-2 pt-4">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">75% Mandatory</span>
                      <CardTitle className={`text-xl font-extrabold mt-1 ${cueOverall.margins.target75.status === "SAFE" ? "text-blue-600 dark:text-blue-400" : "text-amber-500"}`}>
                        {cueOverall.margins.target75.status === "SAFE" ? `Skip ${cueOverall.margins.target75.leavesAllowed} hrs` : `Need ${cueOverall.margins.target75.classesNeeded} hrs`}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">{cueOverall.margins.target75.status === "SAFE" ? "Above mandatory 75%" : "Critical — below 75% limit"}</CardContent>
                  </Card>
                </div>
                {/* CUE subject cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {cueData.map((sub, i) => {
                    const m = calculateAttendanceMargins(sub.attended, sub.total);
                    const pct = sub.total > 0 ? (sub.attended / sub.total) * 100 : 100;
                    return (
                      <Card key={i} className="border-border bg-card shadow-xs relative overflow-hidden">
                        <div className={`absolute top-0 left-0 right-0 h-1.5 ${pct >= 85 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500"}`} />
                        <CardHeader className="pb-3 pt-5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">{sub.code}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pctBadge(pct)}`}>{pct >= 85 ? "Safe" : pct >= 75 ? "Warning" : "Critical"}</span>
                          </div>
                          <CardTitle className="text-sm font-extrabold mt-2">{sub.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-xs">
                          <div>
                            <div className="flex items-baseline justify-between mb-1.5">
                              <span className={`text-2xl font-extrabold ${pctColor(pct)}`}>{pct.toFixed(2)}%</span>
                              <span className="text-muted-foreground">{sub.attended} / {sub.total} hrs</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div className={`h-full ${pct >= 85 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                          </div>
                          <MarginFooter attended={sub.attended} total={sub.total} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            ) : (
              /* No CUE data — prompt to sync via Chrome Extension */
              renderExtensionSyncBanner()
            )}
          </div>
        </div>
      </ChatLayout>
    );
  }

  const { overall, subjects, notifications, recentLogs } = dashboardData;
  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const activeSubject = subjects.find((s) => s.id === selectedSubjectId) || subjects[0];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full bg-background text-foreground flex flex-col overflow-y-auto scrollbar-thin transition-colors duration-200 relative">

        {/* ── Global Warning Banner ── */}
        {(overall.percentage <= 75 || overall.criticalSubjectsCount > 0) && (
          <div className="bg-red-500 text-white px-6 py-3 shrink-0 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 animate-bounce shrink-0" />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider">Mandatory Attendance Warning</p>
                <p className="text-[11px] opacity-90">
                  {overall.percentage <= 75
                    ? `Overall attendance has fallen to ${Number(overall.percentage).toFixed(2)}%, below the mandatory 75% university limit.`
                    : `${overall.criticalSubjectsCount} subject(s) are critically below 75%. Immediate recovery required!`}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-white/30 text-xs font-bold shrink-0"
              onClick={() => setActiveTab("notifications")}
            >
              View Alerts ({unreadNotifications.length})
            </Button>
          </div>
        )}

        {/* ── Header ── */}
        <div className="px-6 py-5 border-b border-border shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl border border-border bg-card flex items-center justify-center">
                <Clock className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-extrabold tracking-tight">Intelligent Attendance Monitor</h1>
                  <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-blue-500/20">
                    AcadSphere Engine
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Live CUE sync · 85% &amp; 75% margin analytics · Proactive alerts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* CUE Sync Button */}
              {cueData ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Wifi className="h-3.5 w-3.5" />
                    <span>CUE Synced · {lastSyncedLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCueModal(true)}
                    className="flex items-center gap-1.5 bg-card border border-border hover:border-blue-500/40 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                    title="Re-sync from CUE Portal"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Re-sync
                  </button>
                  <button
                    type="button"
                    onClick={handleCueClear}
                    className="h-8 w-8 flex items-center justify-center rounded-xl border border-border hover:border-red-500/40 hover:text-red-500 text-muted-foreground transition-all"
                    title="Clear CUE session data"
                  >
                    <WifiOff className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCueModal(true)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-[.98]"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Sync from CUE Portal
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab("notifications")}
                className="relative flex items-center gap-2 bg-card border border-border hover:border-primary px-3 py-2 rounded-xl shadow-xs text-xs font-bold transition-all cursor-pointer"
              >
                <Bell className="h-4 w-4 text-amber-500" />
                <span>Alerts</span>
                {unreadNotifications.length > 0 && (
                  <span className="h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center animate-pulse">
                    {unreadNotifications.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={async () => {
                  setIsSyncing(true);
                  try {
                    // Re-fetch dashboard data from the server DB
                    await refetch();
                    toast.success("Dashboard synced with latest database records.");
                  } catch {
                    toast.error("Failed to refresh data.");
                  } finally {
                    setIsSyncing(false);
                  }
                }}
                disabled={isSyncing}
                className="flex items-center gap-1.5 bg-card border border-border hover:border-primary disabled:opacity-60 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Refresh attendance data from database"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync"}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="relative z-20 flex items-center gap-2 mt-4 pt-3 border-t border-border/40 overflow-x-auto scrollbar-none">
            {(["dashboard", "simulator", "notifications", "faculty"] as const).map((tab) => {
              const labels: Record<string, { label: string; Icon: any }> = {
                dashboard:     { label: "Attendance Dashboard", Icon: CheckCircle2 },
                simulator:     { label: "Prediction Engine", Icon: TrendingUp },
                notifications: { label: "Notification Center", Icon: BellRing },
                faculty:       { label: "Class Ledger", Icon: Layers },
              };
              const { label, Icon } = labels[tab];
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer shrink-0 relative hover:scale-[1.03] active:scale-[0.98]
                    ${activeTab === tab
                      ? "bg-brand-red text-brand-red-foreground shadow-md shadow-brand-red/30"
                      : "bg-card/80 border border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground hover:border-brand-red/40"
                    }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                  {tab === "notifications" && unreadNotifications.length > 0 && (
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 1 — DASHBOARD
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <div className="p-6 space-y-6 flex-1">

            {/* ── CUE Data Source Banner ── */}
            {cueData ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Wifi className="h-4 w-4" />
                  <span>Showing live data from CUE Portal · {cueData.length} subjects · Last synced: {lastSyncedLabel}</span>
                </div>
                <button
                  onClick={() => setShowCueModal(true)}
                  className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" /> Re-sync
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-5 rounded-2xl bg-blue-500/5 border border-blue-500/20 border-dashed">
                <div className="h-11 w-11 rounded-2xl border border-border bg-card flex items-center justify-center shrink-0">
                  <Database className="h-5 w-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-foreground">No Attendance Data Synced Yet</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Click <strong>Sync Now</strong> and enter your Christ University credentials to pull live
                    attendance from ESPRO — directly, no Chrome Extension required.
                  </p>
                </div>
                <button
                  onClick={() => setShowCueModal(true)}
                  className="shrink-0 px-3 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold border border-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <Zap className="h-3.5 w-3.5" /> Sync Now
                </button>
              </div>
            )}


            {/* ── Overall Summary Cards ── */}
            {cueData && cueOverall ? (
              /* ── CUE OVERALL SUMMARY ── */
              <div className="grid gap-4 md:grid-cols-3">
                {/* Card 1: Overall % */}
                <Card className="border-border bg-gradient-to-br from-card to-card/80 shadow-sm relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${cueOverall.pct >= 85 ? "bg-emerald-500" : cueOverall.pct >= 75 ? "bg-amber-500" : "bg-red-500"}`} />
                  <CardHeader className="pb-2 pt-4">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">
                      Overall (CUE Live)
                    </span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className={`text-3xl font-extrabold tracking-tight ${pctColor(cueOverall.pct)}`}>
                        {cueOverall.pct.toFixed(2)}%
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${pctBadge(cueOverall.pct)}`}>
                        {cueOverall.pct >= 85 ? "Safe" : cueOverall.pct >= 75 ? "Warning" : "Critical"}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs">
                    <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${cueOverall.pct >= 85 ? "bg-emerald-500" : cueOverall.pct >= 75 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(100, cueOverall.pct)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 font-medium">
                      {cueOverall.attended} attended / {cueOverall.total} total hrs
                    </p>
                  </CardContent>
                </Card>

                {/* Card 2: 85% Target margin */}
                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">
                        85% Target
                      </span>
                      <ShieldCheck className={`h-4 w-4 ${cueOverall.margins.target85.status === "SAFE" ? "text-emerald-500" : "text-red-500"}`} />
                    </div>
                    <CardTitle className={`text-2xl font-extrabold mt-1 ${cueOverall.margins.target85.status === "SAFE" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {cueOverall.margins.target85.status === "SAFE"
                        ? `Skip ${cueOverall.margins.target85.leavesAllowed} hr${cueOverall.margins.target85.leavesAllowed !== 1 ? "s" : ""}`
                        : `Need ${cueOverall.margins.target85.classesNeeded} hr${cueOverall.margins.target85.classesNeeded !== 1 ? "s" : ""}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">
                    {cueOverall.margins.target85.status === "SAFE"
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Above 85% university honours target</span>
                      : <span className="text-red-600 dark:text-red-400 font-bold">Must attend next {cueOverall.margins.target85.classesNeeded} hrs consecutively to reach 85%</span>}
                  </CardContent>
                </Card>

                {/* Card 3: 75% Target margin */}
                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">
                        75% Target (Mandatory)
                      </span>
                      <ShieldAlert className={`h-4 w-4 ${cueOverall.margins.target75.status === "SAFE" ? "text-blue-500" : "text-amber-500"}`} />
                    </div>
                    <CardTitle className={`text-2xl font-extrabold mt-1 ${cueOverall.margins.target75.status === "SAFE" ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {cueOverall.margins.target75.status === "SAFE"
                        ? `Skip ${cueOverall.margins.target75.leavesAllowed} hr${cueOverall.margins.target75.leavesAllowed !== 1 ? "s" : ""}`
                        : `Need ${cueOverall.margins.target75.classesNeeded} hr${cueOverall.margins.target75.classesNeeded !== 1 ? "s" : ""}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">
                    {cueOverall.margins.target75.status === "SAFE"
                      ? <span className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Above mandatory 75% limit</span>
                      : <span className="text-amber-600 dark:text-amber-400 font-bold">Must attend {cueOverall.margins.target75.classesNeeded} hrs to avoid academic action</span>}
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* ── SQLITE OVERALL SUMMARY (existing 4-card layout) ── */
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-border bg-card shadow-xs relative overflow-hidden md:col-span-1">
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${getProgressColor(overall.statusColor)}`} />
                  <CardHeader className="pb-2 pt-4">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">Overall Attendance</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-3xl font-extrabold tracking-tight text-foreground">{Number(overall.percentage).toFixed(2)}%</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getBadgeStyle(overall.statusColor)}`}>{overall.status}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs">
                    <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden">
                      <div className={`h-full ${getProgressColor(overall.statusColor)} transition-all duration-500`} style={{ width: `${overall.percentage}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 font-medium">{overall.totalAttended} attended / {overall.totalConducted} total</p>
                    {/* Add dual margin badges to overall card */}
                    <div className="mt-3 pt-2 border-t border-border/40">
                      <MarginFooter attended={overall.totalAttended} total={overall.totalConducted} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border bg-card shadow-xs">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">Recovery Needed (75%)</span>
                      <AlertTriangle className={`h-4 w-4 ${overall.requiredFor75 > 0 ? "text-red-500" : "text-emerald-500"}`} />
                    </div>
                    <CardTitle className="text-2xl font-extrabold text-foreground mt-1">
                      {overall.requiredFor75 === 0 ? "0 Classes" : `${overall.requiredFor75} Classes`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">
                    {overall.requiredFor75 === 0
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Above 75% limit</span>
                      : <span className="text-red-600 dark:text-red-400 font-bold">Attend next {overall.requiredFor75} classes to hit 75%</span>}
                  </CardContent>
                </Card>

                <Card className="border-border bg-card shadow-xs">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">Safe Bunks (75%)</span>
                      <ShieldCheck className="h-4 w-4 text-blue-500" />
                    </div>
                    <CardTitle className="text-2xl font-extrabold text-foreground mt-1">{overall.safeMissesCount} Classes</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">
                    Can safely miss {overall.safeMissesCount} total lectures without crossing below 75%
                  </CardContent>
                </Card>

                <Card className="border-border bg-card shadow-xs">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">Risk Monitor</span>
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <div>
                        <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{overall.subjectsAtRiskCount}</p>
                        <p className="text-[10px] text-muted-foreground font-bold">Warning (85%)</p>
                      </div>
                      <div className="h-6 w-px bg-border" />
                      <div>
                        <p className="text-xl font-extrabold text-red-600 dark:text-red-400">{overall.criticalSubjectsCount}</p>
                        <p className="text-[10px] text-muted-foreground font-bold">Critical (&lt;75%)</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground mt-1">
                    Keep subjects above 85% for university honours
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Subject Cards ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2">
                    {cueData ? (
                      <><Wifi className="h-4 w-4 text-emerald-500" /> CUE Portal — Live Subjects</>
                    ) : (
                      <><Database className="h-4 w-4 text-blue-500" /> Subject-Wise Monitoring (Manual Mode)</>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {cueData
                      ? "Real data from Christ University portal. Dual-target margin analytics below each subject."
                      : "Connect CUE Portal above for live data. Manual mode uses locally tracked attendance."}
                  </p>
                </div>
              </div>

              {/* ── CUE Subject Cards ── */}
              {cueData ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {cueData.map((sub, i) => {
                    const m = calculateAttendanceMargins(sub.attended, sub.total);
                    const pct = sub.total > 0 ? (sub.attended / sub.total) * 100 : 100;
                    const displayPct = Math.round(pct * 100) / 100;
                    return (
                      <Card key={i} className="border-border bg-card hover:border-primary/40 transition-all shadow-xs relative overflow-hidden flex flex-col">
                        <div className={`absolute top-0 left-0 right-0 h-1.5 ${pct >= 85 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500"}`} />
                        <CardHeader className="pb-3 pt-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                                {sub.code}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 border-border/60 text-muted-foreground">
                                {sub.type === "Practical"
                                  ? <><FlaskConical className="h-2.5 w-2.5" /> Lab</>
                                  : <><BookOpen className="h-2.5 w-2.5" /> Theory</>}
                              </span>
                            </div>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${pctBadge(pct)}`}>
                              {pct >= 85 ? "Safe" : pct >= 75 ? "Warning" : "Critical"}
                            </span>
                          </div>
                          <CardTitle className="text-sm font-extrabold text-foreground mt-2 leading-tight">
                            {sub.name}
                          </CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-3 text-xs flex-1">
                          {/* Percentage + progress bar */}
                          <div>
                            <div className="flex items-baseline justify-between mb-1.5">
                              <span className={`text-2xl font-extrabold ${pctColor(pct)}`}>
                                {displayPct.toFixed(2)}%
                              </span>
                              <span className="text-muted-foreground font-medium">
                                {sub.attended} / {sub.total} hrs
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ${pct >= 85 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            {/* Threshold markers */}
                            <div className="relative mt-0.5 h-3">
                              <div className="absolute left-[75%] h-3 w-px bg-amber-400/60" title="75%" />
                              <div className="absolute left-[85%] h-3 w-px bg-emerald-400/60" title="85%" />
                            </div>
                          </div>

                          {/* Dual margin analytics */}
                          <MarginFooter attended={sub.attended} total={sub.total} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                /* ── SQLite Subject Cards (manual mode) ── */
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {subjects.map((sub) => (
                    <Card key={sub.id} className="border-border bg-card hover:border-primary/40 transition-all shadow-xs relative overflow-hidden flex flex-col justify-between">
                      <div className={`absolute top-0 left-0 right-0 h-1.5 ${getProgressColor(sub.statusColor)}`} />
                      <CardHeader className="pb-3 pt-5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">{sub.code}</span>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getBadgeStyle(sub.statusColor)}`}>{sub.status}</span>
                        </div>
                        <CardTitle className="text-base font-extrabold text-foreground mt-2">{sub.name}</CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-4 text-xs">
                        <div>
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-2xl font-extrabold text-foreground">{Number(sub.percentage).toFixed(2)}%</span>
                            <span className="text-muted-foreground font-medium">{sub.attended} / {sub.conducted} Classes</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div className={`h-full ${getProgressColor(sub.statusColor)} transition-all duration-500`} style={{ width: `${sub.percentage}%` }} />
                          </div>
                        </div>

                        {/* ✅ Dual 85%/75% margin analytics */}
                        <MarginFooter attended={sub.attended} total={sub.conducted} />

                        {/* AI Suggestion */}
                        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-1">
                          <div className="flex items-center gap-1.5 text-primary text-[10px] font-bold uppercase tracking-wider">
                            <Sparkles className="h-3.5 w-3.5" /> AI Suggestion
                          </div>
                          <p className="text-[11px] text-foreground/90 leading-relaxed">{sub.aiSuggestion}</p>
                        </div>

                        {/* Manual log buttons */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">Manual Log</span>
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" variant="outline"
                              className="h-7 px-2 text-[10px] font-bold text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                              onClick={() => updateMutation.mutate({ subjectId: sub.id, action: "present" })}
                              disabled={updateMutation.isPending}
                            >
                              <Plus className="h-3 w-3 mr-0.5" /> Present
                            </Button>
                            <Button size="sm" variant="outline"
                              className="h-7 px-2 text-[10px] font-bold text-red-600 border-red-500/30 hover:bg-red-500/10"
                              onClick={() => updateMutation.mutate({ subjectId: sub.id, action: "absent" })}
                              disabled={updateMutation.isPending}
                            >
                              <Minus className="h-3 w-3 mr-0.5" /> Bunk
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 2 — PREDICTION SIMULATOR (unchanged, operates on SQLite)
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "simulator" && (
          <div className="p-6 space-y-6 flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Future Attendance Prediction Engine</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Simulate missing or attending future lectures to see exact percentage impact.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Select Subject:</span>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="bg-card border border-border px-3 py-1.5 rounded-xl text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.percentage}%)</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <Card className="border-border bg-card shadow-xs md:col-span-1">
                <CardHeader>
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">Selected Subject</span>
                  <CardTitle className="text-lg font-extrabold text-foreground">{activeSubject.name}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">{activeSubject.code}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground">Current:</span>
                      <span className="text-2xl font-extrabold text-foreground">{activeSubject.percentage}%</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Attended:</span>
                      <span className="font-bold text-foreground">{activeSubject.attended} / {activeSubject.conducted}</span>
                    </div>
                  </div>
                  {/* Margin analytics for active subject */}
                  <MarginFooter attended={activeSubject.attended} total={activeSubject.conducted} />
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px]">
                    💡 Missing 1 class in {activeSubject.name} will drop to <strong>{activeSubject.predictions.miss1}%</strong>.
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-xs md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-foreground">If You Miss / Attend Upcoming Classes</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">Predicted percentage table based on consecutive upcoming classes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 bg-red-500/5 p-4 rounded-2xl border border-red-500/20">
                      <h4 className="text-xs font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingDown className="h-4 w-4" /> Bunk Scenarios
                      </h4>
                      <div className="space-y-2 text-xs">
                        {[["1 class", activeSubject.predictions.miss1], ["2 classes", activeSubject.predictions.miss2], ["3 classes", activeSubject.predictions.miss3]].map(([label, pct]) => (
                          <div key={label as string} className="flex justify-between items-center p-2 rounded-xl bg-card border border-border">
                            <span>If you miss <strong>{label}</strong></span>
                            <span className="font-extrabold text-red-500">{pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20">
                      <h4 className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4" /> Attend Scenarios
                      </h4>
                      <div className="space-y-2 text-xs">
                        {[["1 class", activeSubject.predictions.attend1], ["3 classes", activeSubject.predictions.attend3], ["5 classes", activeSubject.predictions.attend5]].map(([label, pct]) => (
                          <div key={label as string} className="flex justify-between items-center p-2 rounded-xl bg-card border border-border">
                            <span>If you attend <strong>{label}</strong></span>
                            <span className="font-extrabold text-emerald-500">{pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-muted/20 border border-border">
                    <p className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Recent Trend Curve</p>
                    <div className="flex items-end justify-between h-28 gap-2 pt-2 border-b border-border px-2">
                      {activeSubject.trend.map((pt, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                          <span className="text-[10px] font-extrabold text-primary opacity-0 group-hover:opacity-100 transition-opacity">{pt.percentage}%</span>
                          <div className="w-full max-w-[24px] bg-gradient-to-t from-primary/60 to-primary rounded-t-md transition-all duration-300 group-hover:brightness-125"
                            style={{ height: `${pt.percentage * 0.8}%` }} />
                          <span className="text-[9px] font-mono text-muted-foreground mt-1">C{pt.classNum}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 3 — NOTIFICATIONS
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "notifications" && (
          <div className="p-6 space-y-6 flex-1 max-w-4xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Notification &amp; Alert History</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Threshold reminders triggered when attendance crosses 85% or 75%.</p>
              </div>
              {unreadNotifications.length > 0 && (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                  {unreadNotifications.length} Unread
                </span>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-card space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <p className="text-sm font-bold text-foreground">No Attendance Alerts</p>
                <p className="text-xs text-muted-foreground">All subjects are comfortably above university limits!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notif) => (
                  <div key={notif.id} className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${!notif.isRead ? "bg-card border-amber-500/40 shadow-xs" : "bg-muted/20 border-border opacity-80"}`}>
                    <div className="flex items-start gap-3.5">
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${notif.level === "critical" ? "bg-red-500/10 text-red-500" : notif.level === "warning" ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                        {notif.level === "critical" ? <ShieldAlert className="h-5 w-5" /> : notif.level === "warning" ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">{notif.subjectName}</span>
                          <span className="text-[10px] text-muted-foreground font-semibold">{new Date(notif.sentAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs font-bold text-foreground leading-relaxed">{notif.message}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!notif.isRead && (
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-primary font-bold hover:bg-primary/10"
                          onClick={() => markReadMutation.mutate(notif.id)}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Read
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                        onClick={() => deleteNotifMutation.mutate(notif.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 4 — CLASS LEDGER
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "faculty" && (
          <div className="p-6 space-y-6 flex-1">
            <div>
              <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Class Attendance Ledger</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Recent class execution logs and manual ledger sign-offs.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="text-xs font-extrabold text-foreground uppercase tracking-wider">Recent Attendance Logs</span>
                <span className="text-xs font-bold text-muted-foreground">{recentLogs.length} Records</span>
              </div>
              {recentLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">No records yet. Mark attendance on subject cards to add entries!</div>
              ) : (
                <div className="divide-y divide-border">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="p-4 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className={`h-2.5 w-2.5 rounded-full ${log.status === "present" ? "bg-emerald-500" : "bg-red-500"}`} />
                        <div>
                          <p className="font-bold text-foreground">{log.subjectName}</p>
                          <p className="text-[10px] text-muted-foreground">Logged on {log.date}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${log.status === "present" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
                        {log.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}



        {/* ── CUE Sync Modal — CAPTCHA-Aware Direct Sync, Extension & Bookmarklet ── */}
        {showCueModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setShowCueModal(false);
                  setCueError(null);
                }}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/50 z-10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 border-b border-border/60 pb-4 mb-4">
                <div className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center shrink-0 shadow-xs">
                  <Globe className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-foreground">Sync from CUE Portal</h3>
                  <p className="text-xs text-muted-foreground">Direct server sync or browser-assisted integration</p>
                </div>
              </div>

              {/* Navigation Tabs — Extension/Bookmarklet only appear once
                  Direct Sync has actually failed, or the user has already
                  navigated to one. Showing all three upfront every time was
                  confusing since two of them only exist as a fallback. */}
              {(syncTab !== "server" || captchaSession?.reachable === false) && (
                <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl border border-border/50 mb-5">
                  <button
                    type="button"
                    onClick={() => setSyncTab("server")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center hover:scale-[1.02] ${
                      syncTab === "server"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ⚡ Direct Sync
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncTab("extension")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center hover:scale-[1.02] ${
                      syncTab === "extension"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🧩 Extension
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncTab("bookmarklet")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center hover:scale-[1.02] ${
                      syncTab === "bookmarklet"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🔖 Bookmarklet
                  </button>
                </div>
              )}

              {/* ── TAB 1: Direct Server-Side Sync (CAPTCHA-aware) ── */}
              {syncTab === "server" && (
                <div className="space-y-4">
                  {isFetchingSession ? (
                    <div className="p-6 rounded-xl border border-border bg-muted/20 text-center space-y-2">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-primary" />
                      <p className="text-xs font-bold text-foreground">Connecting to Christ University Login Portal...</p>
                      <p className="text-[11px] text-muted-foreground">Preparing secure PKCE session & CAPTCHA verification</p>
                    </div>
                  ) : captchaSession?.reachable === false ? (
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-400 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold">
                          <ShieldAlert className="h-4 w-4 shrink-0" />
                          <span>External Cloud Restrictions Detected</span>
                        </div>
                        <p className="leading-relaxed">
                          Christ University's Keycloak server runs on non-standard port <code className="px-1 py-0.2 rounded bg-amber-500/20 font-mono text-[11px]">8010</code> and blocks direct cloud API connections.
                        </p>
                        <p className="leading-relaxed font-semibold">
                          Please use the <strong>Extension</strong> or <strong>Bookmarklet</strong> tab to sync seamlessly from your browser!
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSyncTab("extension")}
                          className="text-xs font-bold"
                        >
                          🧩 Open Extension Guide
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSyncTab("bookmarklet")}
                          className="text-xs font-bold"
                        >
                          🔖 Open Bookmarklet Guide
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <div className="space-y-1.5">
                        <label htmlFor="cue-username" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          CUE Username / Register No.
                        </label>
                        <input
                          id="cue-username"
                          type="text"
                          value={cueUsername}
                          onChange={(e) => setCueUsername(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleCueSync(cueUsername, cuePassword)}
                          placeholder="e.g. 2547244"
                          autoComplete="username"
                          disabled={isCueSyncing}
                          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 placeholder:text-muted-foreground/40 disabled:opacity-60 transition-all"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="cue-password" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          CUE Password
                        </label>
                        <div className="relative">
                          <input
                            id="cue-password"
                            type={showCuePassword ? "text" : "password"}
                            value={cuePassword}
                            onChange={(e) => setCuePassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCueSync(cueUsername, cuePassword)}
                            placeholder="Your CUE portal password"
                            autoComplete="current-password"
                            disabled={isCueSyncing}
                            className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 placeholder:text-muted-foreground/40 disabled:opacity-60 transition-all"
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowCuePassword(!showCuePassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showCuePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* CAPTCHA Display (if required) */}
                      {captchaSession?.hasCaptcha && (
                        <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2.5 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              Security Verification (CAPTCHA)
                            </label>
                            <button
                              type="button"
                              onClick={fetchCaptchaSession}
                              disabled={isFetchingSession}
                              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                            >
                              <RefreshCw className={`h-3 w-3 ${isFetchingSession ? "animate-spin" : ""}`} /> Refresh
                            </button>
                          </div>

                          {captchaSession.captchaImage ? (
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 bg-background rounded-lg border border-border inline-block">
                                <img
                                  src={captchaSession.captchaImage}
                                  alt="CAPTCHA Challenge"
                                  className="h-10 w-auto rounded object-contain select-none"
                                />
                              </div>
                              <input
                                type="text"
                                value={captchaText}
                                onChange={(e) => setCaptchaText(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCueSync(cueUsername, cuePassword)}
                                placeholder="Enter characters"
                                disabled={isCueSyncing}
                                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 uppercase"
                              />
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={captchaText}
                              onChange={(e) => setCaptchaText(e.target.value)}
                              placeholder="Enter CAPTCHA text shown on login page"
                              disabled={isCueSyncing}
                              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
                            />
                          )}
                        </div>
                      )}

                      {cueError && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                          <p className="leading-relaxed">{cueError}</p>
                        </div>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleCueSync(cueUsername, cuePassword)}
                        disabled={isCueSyncing || !cueUsername.trim() || !cuePassword}
                        className="w-full text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 flex items-center justify-center gap-1.5 disabled:opacity-60 py-2.5 rounded-xl shadow-xs transition-all active:scale-98"
                      >
                        {isCueSyncing ? (
                          <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Authenticating & Syncing...</>
                        ) : (
                          <><Zap className="h-3.5 w-3.5" /> Sync Live Attendance</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 2: Chrome Extension (1-Click Background) ── */}
              {syncTab === "extension" && (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">Automatic</span>
                    <span className="text-xs font-extrabold text-foreground">AcadSphere Chrome Extension</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Auto-captures attendance whenever you view your attendance page on <strong className="text-foreground">cue.christuniversity.in</strong>.
                  </p>

                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2.5 bg-background p-2.5 rounded-xl border border-border/40">
                      <span className="h-5 w-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <span>Go to <strong className="text-foreground">chrome://extensions</strong>, enable <strong className="text-foreground">Developer mode</strong> (top right).</span>
                    </div>
                    <div className="flex items-start gap-2.5 bg-background p-2.5 rounded-xl border border-border/40">
                      <span className="h-5 w-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <div className="flex-1 min-w-0">
                        <span>Click <strong className="text-foreground">Load unpacked</strong> and select the folder:</span>
                        <code className="block mt-1 p-1.5 bg-muted rounded font-mono text-[10px] text-foreground select-all truncate">
                          c:\Users\Roy Mathew\Desktop\spd\acadsphere-extension
                        </code>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 bg-background p-2.5 rounded-xl border border-border/40">
                      <span className="h-5 w-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <span>Visit your CUE Portal Attendance page. Open the extension popup, paste your User ID once, and click <strong className="text-foreground">Sync</strong>.</span>
                    </div>
                  </div>

                  {/* User ID copy box */}
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Your AcadSphere User ID</span>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-xs font-bold text-foreground bg-background px-3 py-1.5 rounded-lg border border-border/50 truncate select-all">
                        {userId || "Sign in to see your User ID"}
                      </code>
                      {userId && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(userId);
                            toast.success("User ID copied!");
                          }}
                          className="shrink-0 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold border border-primary/20 transition-all"
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 3: Bookmarklet ── */}
              {syncTab === "bookmarklet" && (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">No Install</span>
                    <span className="text-xs font-extrabold text-foreground">Browser Bookmarklet</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A lightweight JavaScript bookmark you can run directly while viewing the CUE portal.
                  </p>

                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2.5 bg-background p-2.5 rounded-xl border border-border/40">
                      <span className="h-5 w-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono border border-border">Ctrl+Shift+B</kbd> in Chrome/Edge, right-click bar → <strong className="text-foreground">Add page</strong>.</span>
                    </div>
                    <div className="flex items-start gap-2.5 bg-background p-2.5 rounded-xl border border-border/40">
                      <span className="h-5 w-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <div className="flex-1 min-w-0">
                        <span>Name it <strong className="text-foreground">AcadSphere Sync</strong> and paste the URL from:</span>
                        <code className="block mt-1 p-1.5 bg-muted rounded font-mono text-[10px] text-foreground select-all truncate">
                          supabase/functions/bookmarklet/bookmarklet.url.txt
                        </code>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 bg-background p-2.5 rounded-xl border border-border/40">
                      <span className="h-5 w-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <span>On <strong className="text-foreground">cue.christuniversity.in/main/attendence</strong>, click the bookmark and enter your User ID.</span>
                    </div>
                  </div>

                  {/* User ID copy box */}
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Your AcadSphere User ID</span>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-xs font-bold text-foreground bg-background px-3 py-1.5 rounded-lg border border-border/50 truncate select-all">
                        {userId || "Sign in to see your User ID"}
                      </code>
                      {userId && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(userId);
                            toast.success("User ID copied!");
                          }}
                          className="shrink-0 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold border border-primary/20 transition-all"
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom actions */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/40">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleDemoSync}
                  disabled={isCueSyncing}
                  className="text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 flex items-center gap-1.5 px-3"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Load Demo Data
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCueModal(false);
                    setCueError(null);
                  }}
                  className="text-xs font-bold"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(20px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      </div>
    </ChatLayout>
  );
}
