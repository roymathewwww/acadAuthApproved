import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import {
  listMySectionStudents, getTimetable, upsertTimetable, getSectionSubjects,
} from "@/lib/class-roles.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Layers, Calendar, Users, ClipboardList, Loader2, Save } from "lucide-react";
import { TIME_SLOTS, DAYS_OF_WEEK, slotWeight } from "@/lib/timetable-slots";

export const Route = createFileRoute("/_authenticated/app/class-management")({
  component: ClassManagementPage,
});

// Default starting timetable for 4 MCA-B (Batch 2026, M.Sc DS, Karnataka
// Batch) — shown pre-filled only while the section has nothing saved yet, so
// the class monitor lands on the real schedule instead of a blank grid and
// just needs to hit Save once to persist it. Subject names must match the
// section's synced subject_name values exactly (case included) so they land
// on the right dropdown option and match correctly on the Attendance page.
const DEFAULT_TIMETABLE: Record<string, string[]> = {
  Monday:    ["CLOUD COMPUTING", "MACHINE LEARNING", "THEORY OF COMPUTATION", "DATA ENGINEERING", "Library"],
  Tuesday:   ["DATA ENGINEERING", "MACHINE LEARNING", "SPECIALIZATION PROJECT", "CLOUD COMPUTING", ""],
  Wednesday: ["THEORY OF COMPUTATION", "SPECIALIZATION PROJECT", "DATA ENGINEERING", "Library", ""],
  Thursday:  ["MACHINE LEARNING", "CLOUD COMPUTING", "DATA ENGINEERING", "THEORY OF COMPUTATION", ""],
  Friday:    ["THEORY OF COMPUTATION", "DATA ENGINEERING", "CLOUD COMPUTING", "MACHINE LEARNING", ""],
  Saturday:  ["SPECIALIZATION PROJECT", "Library", "Library", "DATA ENGINEERING", ""],
};

function ClassManagementPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"timetable" | "roster" | "classroom">("timetable");

  const listFn = useServerFn(listMySectionStudents);
  const getTimetableFn = useServerFn(getTimetable);
  const upsertFn = useServerFn(upsertTimetable);
  const getSubjectsFn = useServerFn(getSectionSubjects);

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["sectionRoster"],
    queryFn: () => listFn(),
  });

  const { data: savedTimetable = [], isLoading: ttLoading } = useQuery({
    queryKey: ["classTimetable"],
    queryFn: () => getTimetableFn(),
  });

  const { data: sectionSubjects = [] } = useQuery({
    queryKey: ["sectionSubjects"],
    queryFn: () => getSubjectsFn(),
  });

  // The dropdown lists the section's real synced subjects, plus "Library" as
  // the one fixed non-subject option (a scheduled slot, just not an
  // attendance-tracked one — the Attendance page's calculator already
  // excludes it). Older free-text cells ("CC(NS)", "ML LAB(...)", etc.) won't
  // match any option and show as unselected until re-saved from this
  // dropdown; that's intentional, not a bug — see the info banner below.
  const subjectOptions = useMemo(() => {
    const set = new Set(sectionSubjects);
    set.add("Library");
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sectionSubjects]);

  // Grid state: cellText[day][slotIndex] — edited in place, saved as a batch.
  const [grid, setGrid] = useState<Record<string, string[]> | null>(null);

  // Any cell that isn't ALREADY an exact, recognized subject — empty, or
  // free-typed legacy text like "CC(NS)" / "ML LAB(...)" saved before the
  // dropdown existed — falls back to the known-good default for that
  // day/period, so the class monitor reviews a working timetable instead of
  // stale text. A cell that's already a real saved subject is left alone.
  // Default names are matched case-insensitively against the section's live
  // synced subjects so they land on a valid option even if the exact stored
  // casing differs from what's hardcoded above.
  const { grid: savedGrid, defaultedCount } = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const d of DAYS_OF_WEEK) g[d] = TIME_SLOTS.map(() => "");
    for (const r of savedTimetable) {
      if (g[r.dayOfWeek] && r.periodNumber >= 0 && r.periodNumber < TIME_SLOTS.length) {
        g[r.dayOfWeek][r.periodNumber] = r.subjectName;
      }
    }

    const validOptions = new Set(subjectOptions);
    const bySubjectLower = new Map(sectionSubjects.map((s) => [s.toLowerCase(), s]));
    let defaulted = 0;
    for (const d of DAYS_OF_WEEK) {
      const defaults = DEFAULT_TIMETABLE[d] ?? TIME_SLOTS.map(() => "");
      g[d] = g[d].map((val, i) => {
        if (val && validOptions.has(val)) return val; // already a real, correctly-saved subject
        const fallback = defaults[i] ?? "";
        if (fallback) defaulted++;
        return fallback ? (bySubjectLower.get(fallback.toLowerCase()) ?? fallback) : val;
      });
    }
    return { grid: g, defaultedCount: defaulted };
  }, [savedTimetable, sectionSubjects, subjectOptions]);

  const activeGrid = grid ?? savedGrid;
  const setCell = (day: string, slotIndex: number, value: string) => {
    const next = { ...activeGrid, [day]: [...activeGrid[day]] };
    next[day][slotIndex] = value;
    setGrid(next);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const rows: { dayOfWeek: string; periodNumber: number; subjectName: string }[] = [];
      for (const day of DAYS_OF_WEEK) {
        TIME_SLOTS.forEach((slot, i) => {
          const text = activeGrid[day]?.[i]?.trim();
          if (text) rows.push({ dayOfWeek: day, periodNumber: slot.index, subjectName: text });
        });
      }
      return upsertFn({ data: { rows } });
    },
    onSuccess: () => {
      toast.success("Timetable saved — visible to your class in the Attendance page.");
      qc.invalidateQueries({ queryKey: ["classTimetable"] });
      setGrid(null);
    },
    onError: (err: any) => toast.error(err.message || "Save failed"),
  });

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-gradient-to-b from-muted/40 via-background to-background">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="px-6 py-5 border-b border-border"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-2xl border border-border bg-card flex items-center justify-center">
              <Layers className="h-5 w-5 text-brand-red" />
            </div>
            <div>
              <h1 className="text-base font-display font-black tracking-tight text-foreground">Class Management</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">Timetable, roster, and classroom overview for your section</p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {([
              { id: "timetable", label: "Timetable", Icon: Calendar },
              { id: "roster", label: "Class Roster", Icon: Users },
              { id: "classroom", label: "Classroom Overview", Icon: ClipboardList },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-150 hover:scale-[1.03] active:scale-[0.98] shrink-0 ${
                  tab === id
                    ? "bg-brand-red text-brand-red-foreground shadow-md shadow-brand-red/30"
                    : "bg-card/80 border border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground hover:border-brand-red/40"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </motion.div>

        <div className="p-6">
          {tab === "timetable" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Pick a subject for any cell, then Save — every student in your section sees this from their Attendance page.
                  First period counts as 2 hours for attendance (1 hour on Saturday); every other period counts as 1.
                </p>
                <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1 shrink-0">
                  {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                </Button>
              </div>

              {!ttLoading && sectionSubjects.length === 0 && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-[11px] text-amber-700 dark:text-amber-400">
                  No subjects found yet — the dropdown fills in automatically once your section's students connect Google Classroom / CUE sync on the Attendance page.
                </div>
              )}

              {!ttLoading && defaultedCount > 0 && (
                <div className="rounded-xl border border-brand-red/25 bg-brand-red/10 px-3.5 py-2.5 text-[11px] text-brand-red">
                  {defaultedCount} cell{defaultedCount > 1 ? "s are" : " is"} showing the default 4 MCA-B timetable — either nothing was saved there yet, or it still holds free-typed text from before the dropdown existed. Review and hit Save to make it official; anything you don't change stays as this default.
                </div>
              )}

              {ttLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 text-muted-foreground animate-spin" /></div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-xs border-collapse min-w-[720px]">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="text-left p-2.5 font-bold text-foreground border-b border-border w-24">Day</th>
                        {TIME_SLOTS.map((slot) => (
                          <th key={slot.index} className="text-center p-2.5 font-mono text-[10px] text-muted-foreground border-b border-border">
                            {slot.label}
                            <div className="text-[9px] text-brand-red font-bold mt-0.5">
                              {slotWeight("Monday", slot.index)}h{slot.index === 0 ? " (Sat: 1h)" : ""}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS_OF_WEEK.map((day) => (
                        <tr key={day} className="border-b border-border/60 last:border-0">
                          <td className="p-2.5 font-bold text-foreground bg-muted/30">{day}</td>
                          {TIME_SLOTS.map((slot) => (
                            <td key={slot.index} className="p-1.5 align-top">
                              <select
                                value={activeGrid[day]?.[slot.index] || ""}
                                onChange={(e) => setCell(day, slot.index, e.target.value)}
                                className="w-full min-w-[110px] rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand-red/40 focus:border-brand-red/40"
                              >
                                <option value="">—</option>
                                {subjectOptions.map((name) => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {tab === "roster" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {rosterLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 text-muted-foreground animate-spin" /></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {roster.filter((s) => !s.removed_at).map((s) => (
                    <Card key={s.id}>
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-9 w-9 rounded-xl bg-muted border border-border grid place-items-center text-xs font-bold text-foreground shrink-0">
                            {(s.full_name || s.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{s.full_name || "—"}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                          </div>
                        </div>
                        {s.attendancePercentage !== null ? (
                          <span className={`shrink-0 text-[11px] font-bold ${s.attendancePercentage < 75 ? "text-brand-red" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {s.attendancePercentage.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-muted-foreground/60">Not synced</span>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === "classroom" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {rosterLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 text-muted-foreground animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {roster.filter((s) => !s.removed_at).map((s) => (
                    <Card key={s.id}>
                      <CardContent className="p-3.5 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-foreground">{s.full_name || s.email}</p>
                        <div className="flex items-center gap-3 text-[10px] font-mono">
                          <span className="text-emerald-600 dark:text-emerald-400">{s.classroomCompleted} done</span>
                          <span className="text-amber-600 dark:text-amber-400">{s.classroomPending} pending</span>
                          <span className="text-brand-red">{s.classroomOverdue} overdue</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <p className="text-[10px] text-muted-foreground/70 pt-2">
                    Only reflects students who've connected Google Classroom sync.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </ChatLayout>
  );
}
