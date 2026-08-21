import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import {
  listMySectionStudents, getTimetable, upsertTimetable, type TimetableRow,
} from "@/lib/class-roles.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Layers, Calendar, Users, ClipboardList, Loader2, Save, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/class-management")({
  component: ClassManagementPage,
});

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ClassManagementPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"timetable" | "roster" | "classroom">("timetable");

  const listFn = useServerFn(listMySectionStudents);
  const getTimetableFn = useServerFn(getTimetable);
  const upsertFn = useServerFn(upsertTimetable);

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["sectionRoster"],
    queryFn: () => listFn(),
  });

  const { data: savedTimetable = [], isLoading: ttLoading } = useQuery({
    queryKey: ["classTimetable"],
    queryFn: () => getTimetableFn(),
  });

  const [rows, setRows] = useState<TimetableRow[] | null>(null);
  const activeRows = rows ?? savedTimetable;

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          rows: activeRows.map((r) => ({
            dayOfWeek: r.dayOfWeek,
            periodNumber: r.periodNumber,
            startTime: r.startTime || undefined,
            endTime: r.endTime || undefined,
            subjectCode: r.subjectCode || undefined,
            subjectName: r.subjectName,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Timetable saved — visible to your class in the Attendance page.");
      qc.invalidateQueries({ queryKey: ["classTimetable"] });
      setRows(null);
    },
    onError: (err: any) => toast.error(err.message || "Save failed"),
  });

  const addRow = () => {
    setRows([...activeRows, { dayOfWeek: "Monday", periodNumber: activeRows.length + 1, startTime: "", endTime: "", subjectCode: "", subjectName: "" }]);
  };
  const updateRow = (i: number, patch: Partial<TimetableRow>) => {
    const next = [...activeRows];
    next[i] = { ...next[i], ...patch };
    setRows(next);
  };
  const removeRow = (i: number) => {
    setRows(activeRows.filter((_, idx) => idx !== i));
  };

  const byDay = useMemo(() => {
    const map = new Map<string, typeof activeRows>();
    for (const d of DAYS) map.set(d, []);
    for (const r of activeRows) {
      const list = map.get(r.dayOfWeek) ?? [];
      list.push(r);
      map.set(r.dayOfWeek, list);
    }
    return map;
  }, [activeRows]);

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
                  Upload once per semester (or whenever it changes) — every student in your section sees this from their Attendance page.
                </p>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={addRow} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add Period</Button>
                  <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1">
                    {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                  </Button>
                </div>
              </div>

              {ttLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 text-muted-foreground animate-spin" /></div>
              ) : activeRows.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-16">No timetable yet — click "Add Period" to start.</p>
              ) : (
                <div className="space-y-2">
                  {activeRows.map((r, i) => (
                    <Card key={i}>
                      <CardContent className="p-3 flex flex-wrap items-center gap-2">
                        <select
                          value={r.dayOfWeek}
                          onChange={(e) => updateRow(i, { dayOfWeek: e.target.value })}
                          className="h-8 px-2 rounded-lg border border-border bg-background text-xs"
                        >
                          {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <Input type="number" min={1} value={r.periodNumber} onChange={(e) => updateRow(i, { periodNumber: Number(e.target.value) || 1 })} className="h-8 w-16 text-xs" placeholder="Period" />
                        <Input value={r.startTime || ""} onChange={(e) => updateRow(i, { startTime: e.target.value })} className="h-8 w-24 text-xs" placeholder="Start" />
                        <Input value={r.endTime || ""} onChange={(e) => updateRow(i, { endTime: e.target.value })} className="h-8 w-24 text-xs" placeholder="End" />
                        <Input value={r.subjectCode || ""} onChange={(e) => updateRow(i, { subjectCode: e.target.value })} className="h-8 w-28 text-xs" placeholder="Code" />
                        <Input required value={r.subjectName} onChange={(e) => updateRow(i, { subjectName: e.target.value })} className="h-8 flex-1 min-w-[140px] text-xs" placeholder="Subject name" />
                        <button onClick={() => removeRow(i)} className="p-1.5 rounded-lg hover:bg-brand-red/10 text-muted-foreground hover:text-brand-red">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </CardContent>
                    </Card>
                  ))}
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
