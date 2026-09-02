import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";
import {
  getAttendanceDashboardData,
  getSyncToken,
  regenerateSyncToken,
} from "@/lib/attendance.functions";
import { getTimetable } from "@/lib/class-roles.functions";
import { TIME_SLOTS, DAYS_OF_WEEK, slotWeight, isSubjectCell, cellMatchesSubject } from "@/lib/timetable-slots";
import {
  Clock, CheckCircle2, XCircle, BookOpen, RefreshCw, Puzzle, Copy, Check, X,
  ChevronDown, ChevronRight, Calendar, TrendingUp, ShieldCheck, ShieldAlert,
  KeyRound, Loader2, Wifi, WifiOff, Calculator, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/attendance")({
  component: AttendancePage,
});

const statusStyles: Record<string, { text: string; bg: string; bar: string }> = {
  Excellent: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25", bar: "bg-emerald-500" },
  Safe:      { text: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/10 border-blue-500/25",       bar: "bg-blue-500" },
  Warning:   { text: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/10 border-amber-500/25",     bar: "bg-amber-500" },
  Critical:  { text: "text-brand-red",                          bg: "bg-brand-red/10 border-brand-red/25",     bar: "bg-brand-red" },
};

// Projects a percentage forward by `hours` worth of upcoming class(es), for
// both choices — attend them all, or skip them all. Shared by every scope of
// the leave-impact calculator (single session / whole day / whole week).
function project(attended: number, conducted: number, hours: number): { ifAttend: number | null; ifSkip: number | null } {
  if (hours <= 0) return { ifAttend: null, ifSkip: null };
  return {
    ifAttend: Number((((attended + hours) / (conducted + hours)) * 100).toFixed(2)),
    ifSkip: Number(((attended / (conducted + hours)) * 100).toFixed(2)),
  };
}

function AttendancePage() {
  const qc = useQueryClient();
  const getDashboardFn = useServerFn(getAttendanceDashboardData);
  const getTokenFn = useServerFn(getSyncToken);
  const regenTokenFn = useServerFn(regenerateSyncToken);
  const getTimetableFn = useServerFn(getTimetable);

  const [showConnectPanel, setShowConnectPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [timetableExpanded, setTimetableExpanded] = useState(false);
  const [impactExpanded, setImpactExpanded] = useState(false);
  const [impactScope, setImpactScope] = useState<"session" | "day" | "week">("session");
  const [impactDay, setImpactDay] = useState<string | null>(null);
  const [sessionDay, setSessionDay] = useState<string | null>(null);
  const [selectedSessionKeys, setSelectedSessionKeys] = useState<Set<string>>(new Set());

  const { data: timetable = [] } = useQuery({
    queryKey: ["classTimetable"],
    queryFn: () => getTimetableFn(),
  });
  const timetableByDay = useMemo(() => {
    const map = new Map<string, typeof timetable>();
    for (const r of timetable) {
      const list = map.get(r.dayOfWeek) ?? [];
      list.push(r);
      map.set(r.dayOfWeek, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.periodNumber - b.periodNumber);
    return map;
  }, [timetable]);
  const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["attendanceDashboardData"],
    queryFn: () => getDashboardFn(),
  });

  const { data: tokenData, error: tokenError, isError: tokenIsError, refetch: refetchToken } = useQuery({
    queryKey: ["attendanceSyncToken"],
    queryFn: () => getTokenFn(),
    retry: false,
  });

  const regenMutation = useMutation({
    mutationFn: () => regenTokenFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendanceSyncToken"] });
      toast.success("New sync token generated — the old one no longer works.");
    },
    onError: () => toast.error("Failed to regenerate token."),
  });

  const overall = data?.overall;
  const subjects = data?.subjects ?? [];
  const daily = data?.daily ?? [];
  const hasData = subjects.length > 0;

  // ── Gain/lose attendance calculator, driven by the real timetable ────────
  // Matches each timetable cell to a real synced subject by leading-code/
  // initials (e.g. "CC(NS)" -> "Cloud Computing") or, for cells picked from
  // the new Class Management dropdown, the exact subject name — then weights
  // each match by the 2h-first-period rule and projects attend-vs-skip.
  const subjectImpacts = useMemo(() => {
    return subjects.map((s) => {
      const occurrences: { day: string; periodNumber: number; hours: number }[] = [];
      for (const cell of timetable) {
        if (!isSubjectCell(cell.subjectName)) continue;
        if (cellMatchesSubject(cell.subjectName, s.name, s.code)) {
          occurrences.push({ day: cell.dayOfWeek, periodNumber: cell.periodNumber, hours: slotWeight(cell.dayOfWeek, cell.periodNumber) });
        }
      }
      const weeklyHours = occurrences.reduce((sum, o) => sum + o.hours, 0);
      const weekProj = project(s.attended, s.conducted, weeklyHours);
      const overallWeekProj = overall ? project(overall.totalAttended, overall.totalConducted, weeklyHours) : null;
      return {
        ...s, weeklyHours, occurrences,
        pctIfAttendAllWeek: weekProj.ifAttend,
        pctIfSkipAllWeek: weekProj.ifSkip,
        overallPctIfAttendAllWeek: overallWeekProj?.ifAttend ?? null,
        overallPctIfSkipAllWeek: overallWeekProj?.ifSkip ?? null,
      };
    }).filter((s) => s.weeklyHours > 0);
  }, [subjects, timetable, overall]);

  const dayImpacts = useMemo(() => {
    return DAYS_OF_WEEK.map((day) => {
      const affected: { id: string; name: string; hours: number; currentPct: number; ifSkip: number | null; ifAttend: number | null }[] = [];
      let totalHours = 0;
      for (const s of subjectImpacts) {
        const hoursToday = s.occurrences.filter((o) => o.day === day).reduce((sum, o) => sum + o.hours, 0);
        if (hoursToday > 0) {
          const proj = project(s.attended, s.conducted, hoursToday);
          affected.push({ id: s.id, name: s.name, hours: hoursToday, currentPct: s.percentage, ifSkip: proj.ifSkip, ifAttend: proj.ifAttend });
          totalHours += hoursToday;
        }
      }
      const overallProj = overall ? project(overall.totalAttended, overall.totalConducted, totalHours) : null;
      return {
        day, totalHours, affected,
        overallPctIfSkipped: overallProj?.ifSkip ?? null,
        overallPctIfAttended: overallProj?.ifAttend ?? null,
      };
    }).filter((d) => d.totalHours > 0);
  }, [subjectImpacts, overall]);

  // ── Single-session leave calculator — every individual timetable slot,
  // so a student can ask "what if I skip just this one class?" rather than
  // the whole day or the whole week.
  const sessionOccurrences = useMemo(() => {
    const list: { key: string; day: string; periodNumber: number; startTime: string | null; subjectId: string; subjectName: string; hours: number }[] = [];
    for (const cell of timetable) {
      if (!isSubjectCell(cell.subjectName)) continue;
      const matched = subjects.find((s) => cellMatchesSubject(cell.subjectName, s.name, s.code));
      if (!matched) continue;
      list.push({
        key: `${cell.dayOfWeek}-${cell.periodNumber}`,
        day: cell.dayOfWeek,
        periodNumber: cell.periodNumber,
        startTime: cell.startTime,
        subjectId: matched.id,
        subjectName: matched.name,
        hours: slotWeight(cell.dayOfWeek, cell.periodNumber),
      });
    }
    return list;
  }, [timetable, subjects]);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, typeof sessionOccurrences>();
    for (const o of sessionOccurrences) {
      const list = map.get(o.day) ?? [];
      list.push(o);
      map.set(o.day, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.periodNumber - b.periodNumber);
    return map;
  }, [sessionOccurrences]);

  const sessionDays = useMemo(
    () => DAYS_OF_WEEK.filter((d) => (sessionsByDay.get(d)?.length ?? 0) > 0),
    [sessionsByDay]
  );

  const toggleSessionKey = (key: string) => {
    setSelectedSessionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Selections persist across day switches, so a student can build up an
  // arbitrary combination — one period, a handful across the week, whatever
  // the actual leave looks like — and see the combined effect.
  const selectedSessions = useMemo(
    () => sessionOccurrences.filter((o) => selectedSessionKeys.has(o.key)),
    [sessionOccurrences, selectedSessionKeys]
  );

  const selectedSessionsImpact = useMemo(() => {
    if (selectedSessions.length === 0) return null;

    const bySubject = new Map<string, { subjectId: string; subjectName: string; hours: number }>();
    let totalHours = 0;
    for (const o of selectedSessions) {
      totalHours += o.hours;
      const cur = bySubject.get(o.subjectId) ?? { subjectId: o.subjectId, subjectName: o.subjectName, hours: 0 };
      cur.hours += o.hours;
      bySubject.set(o.subjectId, cur);
    }

    const perSubject = Array.from(bySubject.values())
      .map((entry) => {
        const subj = subjects.find((s) => s.id === entry.subjectId);
        if (!subj) return null;
        const proj = project(subj.attended, subj.conducted, entry.hours);
        return { ...entry, currentPct: subj.percentage, ifSkip: proj.ifSkip, ifAttend: proj.ifAttend };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      totalHours,
      perSubject,
      overallProj: overall ? project(overall.totalAttended, overall.totalConducted, totalHours) : null,
    };
  }, [selectedSessions, subjects, overall]);

  const dailyByDate = useMemo(() => {
    const groups = new Map<string, typeof daily>();
    for (const d of daily) {
      const list = groups.get(d.date) ?? [];
      list.push(d);
      groups.set(d.date, list);
    }
    return Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [daily]);

  const lastSyncedLabel = data?.lastSyncedAt
    ? new Date(data.lastSyncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : null;

  // ── GSAP count-up for the overall percentage ──────────────────────────────
  const pctRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!overall || !pctRef.current) return;
    const counter = { val: 0 };
    gsap.to(counter, {
      val: overall.percentage,
      duration: 1,
      ease: "power2.out",
      onUpdate: () => {
        if (pctRef.current) pctRef.current.innerText = counter.val.toFixed(2);
      },
    });
  }, [overall?.percentage]);

  const copyToken = () => {
    if (!tokenData?.token) return;
    navigator.clipboard.writeText(tokenData.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <ChatLayout activeThreadId={null}>
      <div className="flex flex-col h-full overflow-y-auto bg-gradient-to-b from-muted/40 via-background to-background">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="px-4 py-4 sm:px-6 sm:py-5 border-b border-border shrink-0"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl border border-border bg-card flex items-center justify-center">
                <Clock className="h-5 w-5 text-brand-red" />
              </div>
              <div>
                <h1 className="text-base font-display font-black tracking-tight text-foreground">Attendance</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {hasData
                    ? `Live from CUE Portal${lastSyncedLabel ? ` · Last synced ${lastSyncedLabel}` : ""}`
                    : "Connect the AcadSphere Sync extension to pull your live CUE attendance"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setShowConnectPanel((v) => !v)}
                className="gap-1.5"
              >
                <Puzzle className="h-3.5 w-3.5" />
                {hasData ? "Connect / Re-pair" : "Connect Extension"}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ── Connect Extension panel ── */}
        <AnimatePresence>
          {showConnectPanel && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="border-b border-border bg-card/60"
            >
              <div className="p-4 sm:p-6 max-w-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="h-4 w-4 text-brand-red" />
                  <h2 className="text-sm font-bold text-foreground">Connect the AcadSphere Sync extension</h2>
                </div>

                <ol className="space-y-2.5 text-xs text-muted-foreground list-decimal list-inside">
                  <li>
                    Download the extension folder from the project repo (<code className="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">extension/</code>),
                    open <code className="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">chrome://extensions</code>, enable <strong className="text-foreground">Developer mode</strong>, click <strong className="text-foreground">Load unpacked</strong>, and select that folder.
                  </li>
                  <li>Click the extension icon in your toolbar and paste the sync token below.</li>
                  <li>Log in to <strong className="text-foreground">cue.christuniversity.in</strong> and open your Attendance page.</li>
                  <li>Click <strong className="text-foreground">Sync Now</strong> in the extension popup (or the on-page sync widget) — your data appears here automatically.</li>
                </ol>

                {tokenIsError ? (
                  <div className="rounded-xl border border-brand-red/25 bg-brand-red/10 p-3">
                    <p className="text-xs font-bold text-brand-red">Couldn't generate a token</p>
                    <p className="text-[10px] text-brand-red/90 mt-1">
                      {(tokenError as any)?.message || "Unknown error — check the server logs."}
                    </p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => refetchToken()}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Try again
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-muted/50 font-mono text-[11px] text-foreground truncate">
                        {tokenData?.token ?? "Generating…"}
                      </div>
                      <Button size="icon-sm" variant="outline" onClick={copyToken} title="Copy token">
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => regenMutation.mutate()}
                        disabled={regenMutation.isPending}
                        title="Regenerate token (invalidates the old one)"
                      >
                        {regenMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-2">
                      This token identifies your account to the extension — keep it private, like a password. Regenerating it disconnects any extension using the old one.
                    </p>
                  </>
                )}
                {tokenData?.lastUsedAt && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1">
                    <Wifi className="h-3 w-3" /> Extension last synced {new Date(tokenData.lastUsedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Body ── */}
        <div className="p-4 sm:p-6 space-y-6 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
          ) : !hasData ? (
            <EmptyState onConnect={() => setShowConnectPanel(true)} />
          ) : (
            <>
              {/* ── Overall summary cards ── */}
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                <SummaryCard
                  icon={<Calendar className="h-4 w-4" />}
                  label="Overall Attendance"
                  content={
                    <div className="flex items-baseline gap-1">
                      <span ref={pctRef} className="text-3xl font-display font-black text-foreground">0.0</span>
                      <span className="text-lg font-bold text-muted-foreground">%</span>
                    </div>
                  }
                  sub={`${overall?.totalAttended} / ${overall?.totalConducted} hrs`}
                  barPct={overall?.percentage ?? 0}
                />
                <SummaryCard
                  icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  label="Present"
                  content={<span className="text-3xl font-display font-black text-foreground">{overall?.totalAttended}</span>}
                  sub="hrs attended"
                />
                <SummaryCard
                  icon={<XCircle className="h-4 w-4 text-brand-red" />}
                  label="Absent"
                  content={<span className="text-3xl font-display font-black text-foreground">{(overall?.totalConducted ?? 0) - (overall?.totalAttended ?? 0)}</span>}
                  sub="hrs missed"
                />
              </motion.div>

              {/* ── Margin banner ── */}
              {overall && overall.criticalSubjectsCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-brand-red/10 border border-brand-red/25"
                >
                  <ShieldAlert className="h-4 w-4 text-brand-red shrink-0" />
                  <p className="text-xs font-semibold text-brand-red">
                    {overall.criticalSubjectsCount} subject{overall.criticalSubjectsCount > 1 ? "s are" : " is"} below the 75% mandatory limit.
                  </p>
                </motion.div>
              )}

              {/* ── Course-wise cards ── */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Course-wise</h2>
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                >
                  {subjects.map((s) => {
                    const style = statusStyles[s.status];
                    return (
                      <motion.div
                        key={s.id}
                        variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                        whileHover={{ y: -2 }}
                      >
                        <Card className="h-full">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate">{s.name}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.code} · {s.type}</p>
                                </div>
                              </div>
                              <span className={`shrink-0 text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${style.bg} ${style.text}`}>
                                {s.percentage.toFixed(2)}%
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-3">{s.attended} of {s.conducted} hours attended</p>
                            <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${style.bar}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, s.percentage)}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                              />
                            </div>
                            {s.recoveryNeeded > 0 ? (
                              <p className="text-[10px] text-brand-red mt-2 flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" /> Attend {s.recoveryNeeded} more class{s.recoveryNeeded > 1 ? "es" : ""} to reach 75%
                              </p>
                            ) : s.safeBunks > 0 ? (
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> {s.safeBunks} safe skip{s.safeBunks > 1 ? "s" : ""} before dropping below 75%
                              </p>
                            ) : null}
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>

              {/* ── Day-wise log ── */}
              <div>
                <button
                  onClick={() => setLogExpanded((v) => !v)}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 hover:text-foreground transition-colors"
                >
                  {logExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Day-wise Log {daily.length > 0 && `(${daily.length})`}
                </button>
                <AnimatePresence>
                  {logExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      {dailyByDate.length === 0 ? (
                        <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-4 border border-border/60">
                          No day-wise records yet. The extension syncs day-wise data when it can read your CUE portal's Daily Log tab —
                          re-sync from that tab if this stays empty.
                        </p>
                      ) : (
                        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
                          {dailyByDate.map(([date, records]) => (
                            <div key={date} className="rounded-xl border border-border bg-card p-3">
                              <p className="text-[11px] font-bold text-foreground mb-2">
                                {new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {records.map((r, i) => (
                                  <span
                                    key={i}
                                    className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${
                                      r.status === "present"
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                                        : r.status === "absent"
                                        ? "bg-brand-red/10 text-brand-red border-brand-red/25"
                                        : "bg-muted text-muted-foreground border-border"
                                    }`}
                                  >
                                    {r.subjectName} {r.period ? `· P${r.period}` : ""} · {r.status}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}

          {/* ── Weekly Timetable (uploaded by your Class Leader) ── */}
          {timetable.length > 0 && (
            <div>
              <button
                onClick={() => setTimetableExpanded((v) => !v)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 hover:text-foreground transition-colors"
              >
                {timetableExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Weekly Timetable
              </button>
              <AnimatePresence>
                {timetableExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {DAY_ORDER.filter((d) => timetableByDay.has(d)).map((day) => (
                        <Card key={day}>
                          <CardContent className="p-4">
                            <p className="text-xs font-bold text-foreground mb-2">{day}</p>
                            <div className="space-y-1.5">
                              {timetableByDay.get(day)!.map((r, i) => (
                                <div key={i} className="flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground">
                                    P{r.periodNumber}{r.startTime ? ` · ${r.startTime}` : ""}
                                  </span>
                                  <span className="font-semibold text-foreground text-right">{r.subjectName}</span>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── Leave Impact Calculator ── */}
          {subjectImpacts.length > 0 && (
            <div>
              <button
                onClick={() => setImpactExpanded((v) => !v)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 hover:text-foreground transition-colors"
              >
                {impactExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Calculator className="h-3.5 w-3.5" /> Leave Impact Calculator
              </button>
              <AnimatePresence>
                {impactExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-4"
                  >
                    <p className="text-[10px] text-muted-foreground/80">
                      Computed from your class's timetable matched against your synced subjects — the first period counts as 2 hours (1 on Saturday), every other period counts as 1.
                    </p>

                    {/* Scope switcher */}
                    <div className="inline-flex flex-wrap rounded-xl border border-border bg-muted/40 p-1 gap-1">
                      {([
                        { id: "session", label: "Pick Sessions" },
                        { id: "day", label: "Full Day" },
                        { id: "week", label: "Full Week" },
                      ] as const).map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setImpactScope(opt.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                            impactScope === opt.id
                              ? "bg-brand-red text-brand-red-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* ── Pick Sessions: skip/attend any combination of specific classes ── */}
                    {impactScope === "session" && (
                      <div className="space-y-3">
                        <div>
                          <p className="text-[11px] font-bold text-foreground mb-2">Pick a day</p>
                          <div className="flex flex-wrap gap-1.5">
                            {sessionDays.map((day) => (
                              <button
                                key={day}
                                onClick={() => setSessionDay(day)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                                  sessionDay === day
                                    ? "bg-brand-red text-brand-red-foreground border-brand-red"
                                    : "bg-card border-border text-muted-foreground hover:border-brand-red/40 hover:text-foreground"
                                }`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>

                        {sessionDay && (
                          <div>
                            <p className="text-[11px] font-bold text-foreground mb-2">
                              Tap every class you'll miss on {sessionDay} — pick more than one, or switch days and keep picking.
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {(sessionsByDay.get(sessionDay) ?? []).map((o) => {
                                const slot = TIME_SLOTS.find((t) => t.index === o.periodNumber);
                                const checked = selectedSessionKeys.has(o.key);
                                return (
                                  <button
                                    key={o.key}
                                    onClick={() => toggleSessionKey(o.key)}
                                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                                      checked
                                        ? "bg-brand-red text-brand-red-foreground border-brand-red"
                                        : "bg-card border-border text-muted-foreground hover:border-brand-red/40 hover:text-foreground"
                                    }`}
                                  >
                                    {checked && <Check className="h-3 w-3" />}
                                    {o.subjectName}{slot ? ` · ${slot.label}` : ""}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {selectedSessions.length > 0 && selectedSessionsImpact && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-bold text-foreground">
                                {selectedSessions.length} class{selectedSessions.length > 1 ? "es" : ""} selected · {selectedSessionsImpact.totalHours}h total
                              </p>
                              <button
                                onClick={() => setSelectedSessionKeys(new Set())}
                                className="text-[10px] font-semibold text-muted-foreground hover:text-brand-red transition-colors"
                              >
                                Clear all
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {selectedSessions.map((o) => {
                                const slot = TIME_SLOTS.find((t) => t.index === o.periodNumber);
                                return (
                                  <span
                                    key={o.key}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-muted text-foreground border border-border"
                                  >
                                    {o.day} · {o.subjectName}{slot ? ` · ${slot.label}` : ""}
                                    <button onClick={() => toggleSessionKey(o.key)} className="text-muted-foreground hover:text-brand-red">
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>

                            <Card>
                              <CardContent className="p-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {selectedSessionsImpact.perSubject.map((p) => (
                                    <div key={p.subjectId} className="rounded-xl border border-border bg-muted/30 p-3">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                                        {p.subjectName} <span className="normal-case font-semibold text-muted-foreground/80">({p.hours}h)</span>
                                      </p>
                                      <div className="flex items-center gap-1.5 text-[11px]">
                                        <span className="font-semibold text-foreground">{p.currentPct.toFixed(2)}%</span>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-bold text-brand-red">{p.ifSkip?.toFixed(2)}%</span>
                                        <span className="text-muted-foreground">if skipped</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[11px] mt-1">
                                        <span className="font-semibold text-foreground">{p.currentPct.toFixed(2)}%</span>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{p.ifAttend?.toFixed(2)}%</span>
                                        <span className="text-muted-foreground">if attended</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {selectedSessionsImpact.overallProj && overall && (
                                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                                      Overall attendance ({selectedSessionsImpact.totalHours}h across {selectedSessionsImpact.perSubject.length} subject{selectedSessionsImpact.perSubject.length > 1 ? "s" : ""})
                                    </p>
                                    <div className="flex items-center gap-1.5 text-[11px]">
                                      <span className="font-semibold text-foreground">{overall.percentage.toFixed(2)}%</span>
                                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                      <span className="font-bold text-brand-red">{selectedSessionsImpact.overallProj.ifSkip?.toFixed(2)}%</span>
                                      <span className="text-muted-foreground">if all selected are skipped</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] mt-1">
                                      <span className="font-semibold text-foreground">{overall.percentage.toFixed(2)}%</span>
                                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedSessionsImpact.overallProj.ifAttend?.toFixed(2)}%</span>
                                      <span className="text-muted-foreground">if all selected are attended</span>
                                    </div>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Full Day: skip every class on one day ── */}
                    {impactScope === "day" && dayImpacts.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                          {dayImpacts.map((d) => (
                            <button
                              key={d.day}
                              onClick={() => setImpactDay(impactDay === d.day ? null : d.day)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                                impactDay === d.day
                                  ? "bg-brand-red text-brand-red-foreground border-brand-red"
                                  : "bg-card border-border text-muted-foreground hover:border-brand-red/40 hover:text-foreground"
                              }`}
                            >
                              {d.day}
                            </button>
                          ))}
                        </div>
                        {impactDay && (() => {
                          const d = dayImpacts.find((x) => x.day === impactDay)!;
                          return (
                            <Card>
                              <CardContent className="p-4 space-y-3">
                                <p className="text-[11px] text-muted-foreground">
                                  Skipping all of <strong className="text-foreground">{d.day}</strong> ({d.totalHours}h) affects:
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {d.affected.map((a) => (
                                    <div key={a.id} className="rounded-xl border border-border bg-muted/30 p-2.5">
                                      <p className="text-[10px] font-bold text-foreground mb-1">
                                        {a.name} <span className="text-muted-foreground font-normal">({a.hours}h)</span>
                                      </p>
                                      <div className="flex items-center gap-1.5 text-[11px]">
                                        <span className="font-semibold text-foreground">{a.currentPct.toFixed(2)}%</span>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-bold text-brand-red">{a.ifSkip?.toFixed(2)}%</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {d.overallPctIfSkipped !== null && overall && (
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs pt-2 border-t border-border/60">
                                    <span className="text-muted-foreground">Overall attendance</span>
                                    <span className="font-semibold text-foreground">{overall.percentage.toFixed(2)}%</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                    <span className="font-bold text-brand-red">{d.overallPctIfSkipped.toFixed(2)}%</span>
                                    <span className="text-muted-foreground">if the whole day is skipped</span>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })()}
                      </div>
                    )}

                    {/* ── Full Week: skip every occurrence of one subject ── */}
                    {impactScope === "week" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {subjectImpacts.map((s) => (
                          <Card key={s.id}>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-foreground">{s.name}</p>
                                <span className="text-[10px] font-mono text-muted-foreground">{s.weeklyHours}h/week</span>
                              </div>
                              <div className="space-y-1.5 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-muted-foreground w-28 shrink-0">Attend this week</span>
                                  <span className="font-semibold text-foreground">{s.percentage.toFixed(2)}%</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{s.pctIfAttendAllWeek?.toFixed(2)}%</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-muted-foreground w-28 shrink-0">Skip this week</span>
                                  <span className="font-semibold text-foreground">{s.percentage.toFixed(2)}%</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-bold text-brand-red">{s.pctIfSkipAllWeek?.toFixed(2)}%</span>
                                </div>
                                {overall && (
                                  <div className="flex items-center gap-1.5 pt-1.5 mt-1 border-t border-border/60">
                                    <span className="text-muted-foreground w-28 shrink-0">Overall if skipped</span>
                                    <span className="font-semibold text-foreground">{overall.percentage.toFixed(2)}%</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="font-bold text-brand-red">{s.overallPctIfSkipAllWeek?.toFixed(2)}%</span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </ChatLayout>
  );
}

function SummaryCard({
  icon, label, content, sub, barPct,
}: {
  icon: React.ReactNode; label: string; content: React.ReactNode; sub: string; barPct?: number;
}) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} whileHover={{ y: -2 }}>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-2">
            {icon} {label}
          </div>
          {content}
          <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
          {barPct !== undefined && (
            <div className="h-1.5 rounded-full bg-muted mt-3 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-brand-red"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, barPct)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex flex-col items-center justify-center text-center py-20 px-6"
    >
      <div className="h-16 w-16 rounded-2xl bg-brand-red/10 border border-brand-red/25 flex items-center justify-center mb-4">
        <WifiOff className="h-7 w-7 text-brand-red" />
      </div>
      <h2 className="text-lg font-display font-black text-foreground mb-1">No attendance data yet</h2>
      <p className="text-xs text-muted-foreground max-w-sm mb-5">
        Connect the AcadSphere Sync extension to pull your live, class-wise and day-wise attendance straight from the CUE portal.
      </p>
      <Button onClick={onConnect} className="gap-1.5">
        <Puzzle className="h-3.5 w-3.5" /> Connect Extension
      </Button>
    </motion.div>
  );
}
