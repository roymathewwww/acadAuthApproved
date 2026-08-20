import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStudents } from "@/lib/studentos.functions";
import { Radio, RefreshCw, LogOut, Search, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/live-activity")({
  component: LiveActivityPage,
});

// Dummy demo sessions removed. There is no real live-presence tracking
// backend wired up yet, so this list stays genuinely empty rather than
// fabricating fake page/topic/duration/IP activity for real students.

function LiveActivityPage() {
  const listFn = useServerFn(listStudents);
  const [search, setSearch] = useState("");
  const [terminatedSessions, setTerminatedSessions] = useState<Record<string, boolean>>({});

  const { data: serverStudents = [], isLoading, refetch } = useQuery({
    queryKey: ["liveActivityStudents"],
    queryFn: () => listFn({ data: {} }),
    refetchInterval: 10_000,
  });

  // No real live-presence backend yet — nothing to show until one exists.
  const liveList = useMemo(() => [] as Array<{
    id: string; studentId: string; name: string; department: string; sem: string;
    status: string; page: string; topic: string; duration: string; ip: string;
  }>, [serverStudents, search]);

  function forceLogout(id: string, name: string) {
    setTerminatedSessions((prev) => ({ ...prev, [id]: true }));
    toast.success(`Session closed for ${name}`);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase font-bold tracking-wider text-stone-500 dark:text-zinc-500">
            Real-Time Monitor
          </p>
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-zinc-100 tracking-tight mt-0.5">
            Live Class Activity
          </h1>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">
            Real-time view of students currently studying online and their active study subjects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 text-xs border-stone-200 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 font-semibold gap-1.5 hover:bg-stone-100 dark:hover:bg-zinc-800">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Sync Activity
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          <Input
            placeholder="Search active students by name, USN, or topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs bg-stone-50 dark:bg-zinc-800 border-stone-200 dark:border-zinc-800"
          />
        </div>
        <p className="text-xs font-mono text-stone-500 dark:text-zinc-400">
          Active Now: <span className="font-bold text-emerald-700 dark:text-emerald-400">{liveList.length}</span>
        </p>
      </div>

      {/* Active Session Table */}
      <Card className="border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-stone-100 dark:border-zinc-800 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Active Student Sessions
            </CardTitle>
            <CardDescription className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Updated live every 10 seconds</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-100 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-800/50 text-stone-500 dark:text-zinc-400 font-bold uppercase text-[9.5px] tracking-wider">
                  <th className="px-5 py-3.5 text-left">Student Profile</th>
                  <th className="px-5 py-3.5 text-left">USN</th>
                  <th className="px-5 py-3.5 text-left">Department</th>
                  <th className="px-5 py-3.5 text-left">Current Module & Topic</th>
                  <th className="px-5 py-3.5 text-left">Duration</th>
                  <th className="px-5 py-3.5 text-left">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
                {liveList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-xs text-muted-foreground italic">
                      No active sessions right now.
                    </td>
                  </tr>
                )}
                {liveList.map((s) => {
                  const isTerminated = terminatedSessions[s.id];
                  return (
                    <tr key={s.id} className="hover:bg-stone-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-stone-900 dark:text-zinc-100">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-stone-900 dark:bg-zinc-100 text-stone-50 dark:text-zinc-900 font-bold text-xs flex items-center justify-center shrink-0">
                            {s.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-stone-900 dark:text-zinc-100">{s.name}</p>
                            <p className="text-[10px] font-mono text-stone-400 dark:text-zinc-500">{s.ip}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-stone-600 dark:text-zinc-400">{s.studentId}</td>
                      <td className="px-5 py-3.5">
                        <span className="bg-stone-100 dark:bg-zinc-800 text-stone-800 dark:text-zinc-200 px-2.5 py-0.5 rounded-md text-[10px] font-bold">{s.department} (Sem {s.sem})</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-stone-900 dark:text-zinc-100">{s.page}</p>
                        <p className="text-[10.5px] text-stone-500 dark:text-zinc-400">{s.topic}</p>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-stone-500 dark:text-zinc-400">{s.duration}</td>
                      <td className="px-5 py-3.5">
                        {isTerminated ? (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">Closed</span>
                        ) : s.status === "Idle" ? (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">Idle</span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">Active</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {!isTerminated && (
                          <Button size="sm" variant="outline" onClick={() => forceLogout(s.id, s.name)} className="h-7 text-[10px] border-stone-200 dark:border-zinc-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-bold gap-1">
                            <LogOut className="h-3 w-3" /> End Session
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
