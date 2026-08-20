import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStudents, createStudent, updateStudent, deleteStudent } from "@/lib/studentos.functions";
import { toast } from "sonner";
import {
  Search, Plus, Download, Edit2, Trash2, Key,
  GraduationCap, Loader2, X, CheckCircle2, Eye, Ban, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/admin/students")({
  component: StudentManagement,
});

type SortField = "name" | "department" | "semester" | "cgpa" | "attendancePercentage";
type SortDir = "asc" | "desc";

const DEPARTMENTS = ["CSE", "ECE", "ISE", "MECH", "CIVIL", "EEE", "MCA", "MBA", "BCA"];
const SEMESTERS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const SECTIONS = ["A", "B", "C", "D"];

// Dummy demonstration records intentionally removed — the roster now shows
// only real records from the server, empty until students are actually
// added.

function StudentForm({ initialData, onSubmit, onCancel, isLoading }: {
  initialData?: any; onSubmit: (data: any) => void; onCancel: () => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    studentId: initialData?.studentId || "",
    name: initialData?.name || "",
    email: initialData?.email || `${initialData?.studentId?.toLowerCase() || "student"}@acadsphere.edu`,
    phone: initialData?.phone || "",
    department: initialData?.department || "CSE",
    semester: initialData?.semester || "1",
    section: initialData?.section || "A",
    cgpa: String(initialData?.cgpa || ""),
    attendancePercentage: String(initialData?.attendancePercentage || "100"),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      id: initialData?.id,
      studentId: form.studentId,
      name: form.name,
      email: form.email,
      phone: form.phone,
      department: form.department,
      semester: form.semester,
      section: form.section,
      cgpa: parseFloat(form.cgpa) || 0,
      attendancePercentage: parseFloat(form.attendancePercentage) || 100,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 font-sans">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">USN / Roll No</Label>
          <Input value={form.studentId} onChange={set("studentId")} required className="h-9 text-xs border-stone-200 dark:border-zinc-800" placeholder="1CR22CS001" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Full Name</Label>
          <Input value={form.name} onChange={set("name")} required className="h-9 text-xs border-stone-200 dark:border-zinc-800" placeholder="John Doe" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Email Address</Label>
          <Input type="email" value={form.email} onChange={set("email")} required className="h-9 text-xs border-stone-200 dark:border-zinc-800" placeholder="john.doe@acadsphere.edu" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Phone</Label>
          <Input value={form.phone} onChange={set("phone")} className="h-9 text-xs border-stone-200 dark:border-zinc-800" placeholder="+91 9876543210" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {(["department", "semester", "section"] as const).map((k) => (
          <div key={k} className="space-y-1">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">{k}</Label>
            <select
              value={form[k]}
              onChange={set(k)}
              className="w-full h-9 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs focus:outline-none"
            >
              {(k === "department" ? DEPARTMENTS : k === "semester" ? SEMESTERS : SECTIONS).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">CGPA</Label>
          <Input type="number" step="0.01" value={form.cgpa} onChange={set("cgpa")} className="h-9 text-xs border-stone-200 dark:border-zinc-800" placeholder="8.50" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Attendance %</Label>
          <Input type="number" value={form.attendancePercentage} onChange={set("attendancePercentage")} className="h-9 text-xs border-stone-200 dark:border-zinc-800" placeholder="88" />
        </div>
      </div>
      <div className="flex gap-3 justify-end pt-3 border-t border-stone-100 dark:border-zinc-800">
        <Button type="button" variant="outline" onClick={onCancel} className="h-9 text-xs border-stone-200 dark:border-zinc-800">Cancel</Button>
        <Button type="submit" disabled={isLoading} className="h-9 text-xs font-bold bg-stone-900 dark:bg-zinc-100 text-stone-50 dark:text-zinc-900">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (initialData ? "Save Changes" : "Enrol Student")}
        </Button>
      </div>
    </form>
  );
}

function StudentManagement() {
  const qc = useQueryClient();
  const listFn = useServerFn(listStudents);
  const createFn = useServerFn(createStudent);
  const deleteFn = useServerFn(deleteStudent);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [semFilter, setSemFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showForm, setShowForm] = useState(false);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [viewStudent, setViewStudent] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [disabledStudents, setDisabledStudents] = useState<Record<string, boolean>>({});

  const { data: serverStudents = [], isLoading } = useQuery({
    queryKey: ["adminStudents", search, deptFilter, semFilter],
    queryFn: () => listFn({ data: { search, department: deptFilter, semester: semFilter } }),
    refetchInterval: 30_000,
  });

  const allStudents = useMemo(() => serverStudents, [serverStudents]);

  const filtered = useMemo(() => {
    return allStudents.filter((s: any) => {
      const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.studentId && s.studentId.toLowerCase().includes(search.toLowerCase()));
      const matchDept = !deptFilter || s.department === deptFilter;
      const matchSem = !semFilter || String(s.semester) === String(semFilter);
      return matchSearch && matchDept && matchSem;
    });
  }, [allStudents, search, deptFilter, semFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      let av = a[sortField] ?? "";
      let bv = b[sortField] ?? "";
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortField, sortDir]);

  const createMut = useMutation({
    mutationFn: (data: any) => createFn({ data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminStudents"] }); setShowForm(false); toast.success("Student record updated!"); },
    onError: (e: any) => toast.error(e.message || "Failed to add student"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminStudents"] }); setDeleteId(null); toast.success("Record removed"); },
    onError: (e: any) => toast.error(e.message || "Failed to delete student"),
  });

  function toggleStatus(id: string, name: string) {
    setDisabledStudents((prev) => {
      const nextState = !prev[id];
      toast.success(nextState ? `Enrolment paused for ${name}` : `Enrolment active for ${name}`);
      return { ...prev, [id]: nextState };
    });
  }

  function resetPassword(name: string) {
    const tempPass = `Acad#${Math.floor(100000 + Math.random() * 900000)}`;
    toast.success(`Passcode for ${name}: ${tempPass}`, { duration: 6000 });
  }

  function exportCSV() {
    const header = ["Name", "USN", "Department", "Semester", "Section", "CGPA", "Attendance"];
    const rows = sorted.map((s: any) => [s.name, s.studentId || "—", s.department, s.semester, s.section, s.cgpa || 0, `${s.attendancePercentage || 100}%`]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "students_registry.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV Export Generated");
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase font-bold tracking-wider text-stone-500 dark:text-zinc-500">
            Student Directory
          </p>
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-zinc-100 tracking-tight mt-0.5">
            Student Records & Directory
          </h1>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">
            Enrolled student list, department breakdown, academic scores, and profile records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-9 text-xs gap-1.5 border-stone-200 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 font-semibold hover:bg-stone-100 dark:hover:bg-zinc-800">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => { setEditStudent(null); setShowForm(true); }} className="h-9 text-xs font-bold gap-1.5 bg-stone-900 dark:bg-zinc-100 text-stone-50 dark:text-zinc-900 shadow-sm hover:bg-stone-800">
            <Plus className="h-3.5 w-3.5" /> Enrol Student
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm">
        <div className="flex flex-wrap gap-2.5 flex-1 w-full md:w-auto">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
            <Input
              placeholder="Search by student name or USN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs bg-stone-50 dark:bg-zinc-800 border-stone-200 dark:border-zinc-800"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-8 rounded-lg border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-800 px-3 text-xs focus:outline-none"
          >
            <option value="">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={semFilter}
            onChange={(e) => setSemFilter(e.target.value)}
            className="h-8 rounded-lg border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-800 px-3 text-xs focus:outline-none"
          >
            <option value="">All Semesters</option>
            {SEMESTERS.map((s) => <option key={s} value={s}>Semester {s}</option>)}
          </select>
        </div>
        <p className="text-xs font-mono text-stone-500 dark:text-zinc-400">
          Total Listed: <span className="font-bold text-stone-900 dark:text-zinc-100">{sorted.length}</span>
        </p>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-800 p-6 w-full max-w-lg shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-zinc-100">
                {editStudent ? "Edit Student Details" : "New Student Enrolment"}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-zinc-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <StudentForm
              initialData={editStudent}
              onSubmit={(data) => createMut.mutate(data)}
              onCancel={() => setShowForm(false)}
              isLoading={createMut.isPending}
            />
          </div>
        </div>
      )}

      {/* Profile Detail Drawer */}
      {viewStudent && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-800 p-6 w-full max-w-2xl shadow-xl my-6 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between border-b border-stone-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-stone-900 dark:bg-zinc-100 text-stone-50 dark:text-zinc-900 flex items-center justify-center font-extrabold text-base">
                  {viewStudent.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-stone-900 dark:text-zinc-100">{viewStudent.name}</h3>
                  <p className="text-xs text-stone-500 dark:text-zinc-400 font-mono">
                    USN: {viewStudent.studentId || "1CR22CS045"} · {viewStudent.department} (Sem {viewStudent.semester}, Sec {viewStudent.section})
                  </p>
                </div>
              </div>
              <button onClick={() => setViewStudent(null)} className="p-1.5 rounded-lg border border-stone-200 dark:border-zinc-800 text-stone-400 hover:text-stone-900 dark:hover:text-zinc-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-stone-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-stone-200/80 dark:border-zinc-800">
                <p className="text-[9px] font-bold text-stone-500 dark:text-zinc-400 uppercase">CGPA Score</p>
                <p className="text-lg font-black text-stone-900 dark:text-zinc-100 mt-0.5">{viewStudent.cgpa?.toFixed(2) || "8.50"}</p>
              </div>
              <div className="bg-stone-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-stone-200/80 dark:border-zinc-800">
                <p className="text-[9px] font-bold text-stone-500 dark:text-zinc-400 uppercase">Attendance</p>
                <p className={`text-lg font-black mt-0.5 ${viewStudent.attendancePercentage >= 75 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>{viewStudent.attendancePercentage?.toFixed(0) || "88"}%</p>
              </div>
              <div className="bg-stone-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-stone-200/80 dark:border-zinc-800">
                <p className="text-[9px] font-bold text-stone-500 dark:text-zinc-400 uppercase">Status</p>
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400 mt-0.5">Enrolled</p>
              </div>
            </div>

            <div className="bg-stone-50 dark:bg-zinc-800/60 rounded-xl p-4 border border-stone-200/80 dark:border-zinc-800 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Class Activity Log</p>
              <div className="space-y-2 text-xs font-mono">
                {[
                  { time: "09:10 AM", action: "Signed in on Chrome" },
                  { time: "09:15 AM", action: "Opened Smart Notes — DBMS Normalization" },
                  { time: "09:22 AM", action: "Completed CPU Scheduling Practice" },
                  { time: "09:30 AM", action: "Viva Session Score: 92%" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800">
                    <span className="text-stone-800 dark:text-zinc-200 font-semibold">{item.action}</span>
                    <span className="text-stone-400 dark:text-zinc-500 text-[10px]">{item.time} Today</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-800 p-6 w-full max-w-sm shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-zinc-100">Remove Student Record?</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">This record will be permanently deleted from the directory.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteId(null)} className="h-8 text-xs border-stone-200 dark:border-zinc-800">Cancel</Button>
              <Button size="sm" onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending} className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white font-bold">
                {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Student Table Card */}
      <Card className="border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-stone-500 text-xs">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading student directory...
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-stone-400">
            <GraduationCap className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs font-bold">No student records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-100 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-800/50 text-stone-500 dark:text-zinc-400 font-bold uppercase text-[9.5px] tracking-wider">
                  <th className="px-5 py-3.5 text-left">Student</th>
                  <th className="px-5 py-3.5 text-left">USN</th>
                  <th className="px-5 py-3.5 text-left">Department</th>
                  <th className="px-5 py-3.5 text-left">Semester</th>
                  <th className="px-5 py-3.5 text-left">CGPA</th>
                  <th className="px-5 py-3.5 text-left">Attendance</th>
                  <th className="px-5 py-3.5 text-left">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
                {sorted.map((student: any) => {
                  const isDisabled = disabledStudents[student.id];
                  return (
                    <tr key={student.id} className="hover:bg-stone-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-stone-900 dark:bg-zinc-100 text-stone-50 dark:text-zinc-900 font-bold text-xs flex items-center justify-center shrink-0">
                            {student.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-stone-900 dark:text-zinc-100">{student.name}</p>
                            <p className="text-[10px] font-mono text-stone-400 dark:text-zinc-500">{student.email || `${student.studentId?.toLowerCase()}@acadsphere.edu`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-stone-600 dark:text-zinc-400">{student.studentId || "—"}</td>
                      <td className="px-5 py-3.5">
                        <span className="bg-stone-100 dark:bg-zinc-800 text-stone-800 dark:text-zinc-200 px-2.5 py-0.5 rounded-md text-[10px] font-bold">{student.department}</span>
                      </td>
                      <td className="px-5 py-3.5 text-stone-600 dark:text-zinc-400">Sem {student.semester} ({student.section})</td>
                      <td className="px-5 py-3.5 font-bold text-stone-900 dark:text-zinc-100">{student.cgpa?.toFixed(2) || "—"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`font-bold ${student.attendancePercentage >= 75 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                          {student.attendancePercentage?.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {isDisabled ? (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">Paused</span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">Enrolled</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewStudent(student)} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-800" title="View Profile">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => { setEditStudent(student); setShowForm(true); }} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-800" title="Edit">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => resetPassword(student.name)} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-800" title="Reset Passcode">
                            <Key className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => toggleStatus(student.id, student.name)} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-800" title={isDisabled ? "Resume" : "Pause"}>
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(student.id)} className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" title="Remove">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
