import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import {
  listMySectionStudents, createStudentAccount, updateStudentProfile, removeStudent,
  type RosterEntry,
} from "@/lib/class-roles.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Edit3, UserX, X, GraduationCap, Copy, Check,
  Loader2, Crown,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/students")({
  component: TeacherDashboardPage,
});

function TeacherDashboardPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", fullName: "" });
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [editing, setEditing] = useState<RosterEntry | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "" });

  const listFn = useServerFn(listMySectionStudents);
  const createFn = useServerFn(createStudentAccount);
  const updateFn = useServerFn(updateStudentProfile);
  const removeFn = useServerFn(removeStudent);

  const { data: roster = [], isLoading } = useQuery({
    queryKey: ["sectionRoster"],
    queryFn: () => listFn(),
  });

  const filtered = roster.filter((s) =>
    !search.trim() ||
    (s.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const createMut = useMutation({
    mutationFn: () => createFn({ data: addForm }),
    onSuccess: (creds) => {
      setCreatedCreds(creds);
      qc.invalidateQueries({ queryKey: ["sectionRoster"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to create account"),
  });

  const updateMut = useMutation({
    mutationFn: () => updateFn({ data: { id: editing!.id, fullName: editForm.fullName } }),
    onSuccess: () => {
      toast.success("Student updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["sectionRoster"] });
    },
    onError: (err: any) => toast.error(err.message || "Update failed"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Student removed — they'll see a block message on next login.");
      qc.invalidateQueries({ queryKey: ["sectionRoster"] });
    },
    onError: (err: any) => toast.error(err.message || "Removal failed"),
  });

  const closeAddModal = () => {
    setAddOpen(false);
    setAddForm({ email: "", fullName: "" });
    setCreatedCreds(null);
  };

  const copyCreds = () => {
    if (!createdCreds) return;
    navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-gradient-to-b from-muted/40 via-background to-background">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl border border-border bg-card flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-brand-red" />
              </div>
              <div>
                <h1 className="text-base font-display font-black tracking-tight text-foreground">Dashboard</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {roster.length} student{roster.length !== 1 ? "s" : ""} in your class
                </p>
              </div>
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Student
            </Button>
          </div>

          <div className="relative mt-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </motion.div>

        <div className="p-4 sm:p-6">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-20 flex justify-center">
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-20 text-center text-xs text-muted-foreground">
                  No students found. Click "Add Student" to create your first account.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
                      <tr>
                        <th className="text-left py-3 px-4">Student</th>
                        <th className="text-left py-3 px-4">Email</th>
                        <th className="text-center py-3 px-4">Role</th>
                        <th className="text-center py-3 px-4">Attendance</th>
                        <th className="text-center py-3 px-4">Classroom</th>
                        <th className="text-right py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <AnimatePresence initial={false}>
                        {filtered.map((s) => (
                          <motion.tr
                            key={s.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`transition-colors hover:bg-accent/60 ${s.removed_at ? "opacity-50" : ""}`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-xl bg-muted border border-border grid place-items-center text-[11px] font-bold text-foreground">
                                  {(s.full_name || s.email).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-foreground">{s.full_name || "—"}</div>
                                  {s.removed_at && <div className="text-[10px] text-brand-red">Removed</div>}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">{s.email}</td>
                            <td className="py-3 px-4 text-center">
                              {s.role === "class_leader" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/30">
                                  <Crown className="h-3 w-3" /> CR
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">Student</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {s.attendancePercentage !== null ? (
                                <span className={`text-[11px] font-bold ${s.attendancePercentage < 75 ? "text-brand-red" : "text-emerald-600 dark:text-emerald-400"}`}>
                                  {s.attendancePercentage.toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/60">Not synced</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center text-[10px] text-muted-foreground">
                              {s.classroomCompleted}✓ / {s.classroomPending}◷ / {s.classroomOverdue}!
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => { setEditing(s); setEditForm({ fullName: s.full_name || "" }); }}
                                  className="p-2 sm:p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                                  title="Edit"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                {!s.removed_at && (
                                  <button
                                    onClick={() => { if (confirm(`Remove ${s.full_name || s.email}? They'll be blocked from logging in.`)) removeMut.mutate(s.id); }}
                                    className="p-2 sm:p-1.5 rounded-lg hover:bg-brand-red/10 text-muted-foreground hover:text-brand-red"
                                    title="Remove"
                                  >
                                    <UserX className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add student modal */}
        <AnimatePresence>
          {addOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4"
            >
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                <Card className="w-full max-w-sm relative">
                  <button onClick={closeAddModal} className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-0 rounded-md text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                  <CardContent className="p-6 space-y-4">
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <GraduationCap className="h-4 w-4 text-brand-red" /> Add Student
                    </h2>

                    {createdCreds ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Account created. Copy these credentials — the password won't be shown again.
                        </p>
                        <div className="rounded-xl border border-border bg-muted/50 p-3 font-mono text-[11px] space-y-1">
                          <div><span className="text-muted-foreground">Email:</span> {createdCreds.email}</div>
                          <div><span className="text-muted-foreground">Password:</span> {createdCreds.password}</div>
                        </div>
                        <Button onClick={copyCreds} variant="outline" className="w-full gap-1.5">
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied ? "Copied" : "Copy Credentials"}
                        </Button>
                        <Button onClick={closeAddModal} className="w-full">Done</Button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}
                        className="space-y-3"
                      >
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Full Name</label>
                          <Input required value={addForm.fullName} onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })} className="h-9 text-xs" />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Email</label>
                          <Input required type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} className="h-9 text-xs" />
                        </div>
                        <Button type="submit" disabled={createMut.isPending} className="w-full">
                          {createMut.isPending ? "Creating…" : "Create Account"}
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit student modal */}
        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4"
            >
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                <Card className="w-full max-w-sm relative">
                  <button onClick={() => setEditing(null)} className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-0 rounded-md text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                  <CardContent className="p-6 space-y-4">
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <Edit3 className="h-4 w-4 text-brand-red" /> Edit Student
                    </h2>
                    <form onSubmit={(e) => { e.preventDefault(); updateMut.mutate(); }} className="space-y-3">
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground block mb-1">Full Name</label>
                        <Input required value={editForm.fullName} onChange={(e) => setEditForm({ fullName: e.target.value })} className="h-9 text-xs" />
                      </div>
                      <Button type="submit" disabled={updateMut.isPending} className="w-full">
                        {updateMut.isPending ? "Saving…" : "Save Changes"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ChatLayout>
  );
}
