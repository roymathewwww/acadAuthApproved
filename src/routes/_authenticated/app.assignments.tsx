import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { 
  listAssignments, createAssignment, listSubmissions, 
  createSubmission, gradeSubmission, listSubjects, getProfileAndRole 
} from "@/lib/studentos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  ClipboardList, Plus, FileText, CheckCircle2, AlertCircle, Calendar, 
  User, Check, Upload, HelpCircle, FileCheck, RefreshCw, X
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/assignments")({
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"board" | "submissions">("board");
  
  // Faculty Create Assignment Form State
  const [createOpen, setCreateOpen] = useState(false);
  const [newAssign, setNewAssign] = useState({
    title: "",
    description: "",
    subjectId: "",
    dueDate: "",
  });

  // Student Submit Form State
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selectedAssignId, setSelectedAssignId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  // Faculty Grading Form State
  const [gradingOpen, setGradingOpen] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [grade, setGrade] = useState("A");
  const [feedback, setFeedback] = useState("");

  // Server functions
  const getProfileFn = useServerFn(getProfileAndRole);
  const listAssignsFn = useServerFn(listAssignments);
  const createAssignFn = useServerFn(createAssignment);
  const listSubsFn = useServerFn(listSubmissions);
  const submitFn = useServerFn(createSubmission);
  const gradeFn = useServerFn(gradeSubmission);
  const listSubjectsFn = useServerFn(listSubjects);

  // Queries
  const { data: profile } = useQuery({
    queryKey: ["userProfile"],
    queryFn: () => getProfileFn(),
  });

  const { data: assignments = [], isLoading: loadingAssigns } = useQuery({
    queryKey: ["assignmentsList"],
    queryFn: () => listAssignsFn(),
  });

  const { data: submissions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ["submissionsList", selectedAssignId],
    queryFn: () => listSubsFn({ data: { assignmentId: selectedAssignId || undefined, studentId: profile?.role === "student" ? profile.id : undefined } }),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjectsList"],
    queryFn: () => listSubjectsFn(),
  });

  const activeRole = profile?.role || "student";
  const isFaculty = activeRole === "faculty" || activeRole === "admin";

  // Mutations
  const createAssignMut = useMutation({
    mutationFn: (data: typeof newAssign) => createAssignFn({ data }),
    onSuccess: () => {
      toast.success("Assignment created and broadcasted successfully!");
      setCreateOpen(false);
      setNewAssign({ title: "", description: "", subjectId: "", dueDate: "" });
      qc.invalidateQueries({ queryKey: ["assignmentsList"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create assignment");
    }
  });

  const submitMut = useMutation({
    mutationFn: (data: { assignmentId: string; fileUrl: string }) => submitFn({ data }),
    onSuccess: () => {
      toast.success("Assignment submitted successfully!");
      setSubmitOpen(false);
      setFileName("");
      qc.invalidateQueries({ queryKey: ["submissionsList"] });
      qc.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Submission failed");
    }
  });

  const gradeMut = useMutation({
    mutationFn: (data: { id: string; grade: string; feedback: string }) => gradeFn({ data }),
    onSuccess: () => {
      toast.success("Grade submitted successfully!");
      setGradingOpen(false);
      setGrade("A");
      setFeedback("");
      qc.invalidateQueries({ queryKey: ["submissionsList"] });
      qc.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Grading failed");
    }
  });

  // Calculate submission status maps for students
  const subMap = new Map((submissions || []).map((s: any) => [s.assignmentId, s]));

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-[#0B0F19] text-slate-100 p-4 sm:p-6 md:p-8 scrollbar-thin font-sans">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-rose-400" /> Academic Assignment Board
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Upload homework worksheets, grade terms, and monitor classroom schedules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isFaculty && (
              <>
                <Button 
                  onClick={() => { setActiveTab("board"); setCreateOpen(true); }}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Post Assignment
                </Button>
                <div className="flex bg-slate-900 border border-slate-800 rounded p-0.5">
                  <button 
                    onClick={() => setActiveTab("board")}
                    className={`px-3 py-1 rounded text-xs transition-colors ${activeTab === "board" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Assignments
                  </button>
                  <button 
                    onClick={() => setActiveTab("submissions")}
                    className={`px-3 py-1 rounded text-xs transition-colors ${activeTab === "submissions" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Grading Desk
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ------------------- ASSIGNMENT BOARDS TAB ------------------- */}
        {activeTab === "board" && (
          <div className="grid gap-6 lg:grid-cols-3">
            
            {/* Left/Middle Column: Assignments list */}
            <div className="lg:col-span-2 space-y-4">
              {loadingAssigns ? (
                <div className="py-20 flex justify-center items-center text-slate-400">
                  <RefreshCw className="animate-spin h-5 w-5 mr-1" /> Loading assignments...
                </div>
              ) : assignments.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs">No assignments currently active.</div>
              ) : (
                assignments.map((as: any) => {
                  const submission = subMap.get(as.id) as any;
                  const isSubmitted = !!submission;
                  const isGraded = submission?.status === "graded";
                  const isLate = submission?.status === "late";

                  return (
                    <Card key={as.id} className="bg-slate-900/40 border-slate-800 text-left transition-all hover:border-slate-700/80">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <span className="px-2 py-0.5 bg-rose-950/20 border border-rose-800/40 text-rose-400 text-[9px] font-bold rounded uppercase tracking-wider font-mono">
                            {as.subjectCode || "CORE"}
                          </span>
                          
                          {/* Student submission state indicators */}
                          {!isFaculty && (
                            <div className="text-right">
                              {isGraded ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 px-2 py-0.5 bg-green-950/25 border border-green-800/30 rounded">
                                  <Check className="h-3 w-3" /> Graded: {submission.grade}
                                </span>
                              ) : isSubmitted ? (
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  isLate ? "text-amber-400 bg-amber-950/25 border-amber-800/30" : "text-blue-400 bg-blue-950/25 border-blue-800/30"
                                }`}>
                                  <FileCheck className="h-3 w-3" /> Submitted {isLate && "(Late)"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 px-2 py-0.5 bg-rose-950/20 border border-rose-800/30 rounded animate-pulse">
                                  <AlertCircle className="h-3 w-3" /> Pending Submission
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <CardTitle className="text-sm font-semibold text-slate-200 mt-2">{as.title}</CardTitle>
                        <CardDescription className="text-xs text-slate-500">{as.subjectName}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-slate-300 leading-relaxed mb-4">{as.description}</p>
                        
                        <div className="flex justify-between items-center border-t border-slate-850 pt-3">
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-500" />
                            Due: {new Date(as.dueDate).toLocaleString()}
                          </div>

                          {!isFaculty && !isGraded && (
                            <Button 
                              onClick={() => { setSelectedAssignId(as.id); setSubmitOpen(true); }}
                              size="sm" 
                              className="h-7 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200"
                            >
                              <Upload className="h-3 w-3 mr-1" /> {isSubmitted ? "Resubmit" : "Submit File"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Right Column: Deadlines Timeline */}
            <div className="space-y-6">
              <Card className="bg-slate-900/40 border-slate-800 text-left">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-slate-200">Deadlines Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {assignments.slice(0, 3).map((as: any, i: number) => (
                    <div key={i} className="flex gap-3 text-left">
                      <div className="w-1 bg-rose-500 rounded"></div>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">{as.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{new Date(as.dueDate).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

          </div>
        )}

        {/* ------------------- FACULTY GRADING TAB ------------------- */}
        {activeTab === "submissions" && isFaculty && (
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="border-b border-slate-850">
              <CardTitle className="text-sm font-semibold text-slate-200">Pending Submissions Registry</CardTitle>
              <CardDescription className="text-xs text-slate-500">Grade submitted student worksheets.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingSubs ? (
                <div className="py-12 flex justify-center items-center text-slate-400">
                  <RefreshCw className="animate-spin h-5 w-5 mr-1" /> Fetching submissions...
                </div>
              ) : submissions.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">No student submissions logged yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-slate-950/40 border-b border-slate-850 font-mono text-[9px] text-slate-400">
                      <tr>
                        <th className="py-3 px-4 text-left">Student</th>
                        <th className="py-3 px-4 text-left">Assignment</th>
                        <th className="py-3 px-4 text-left">Submission Date</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">File</th>
                        <th className="py-3 px-4 text-center">Grade</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {submissions.map((sub: any) => (
                        <tr key={sub.id} className="hover:bg-slate-900/20">
                          <td className="py-3 px-4 font-semibold text-slate-200">{sub.studentName}</td>
                          <td className="py-3 px-4 text-slate-300">{sub.assignmentTitle}</td>
                          <td className="py-3 px-4 font-mono text-slate-400">{new Date(sub.submittedAt).toLocaleDateString()}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              sub.status === "graded" 
                                ? "bg-green-950/20 border-green-800 text-green-400" 
                                : sub.status === "late" 
                                  ? "bg-red-950/20 border-red-800 text-red-400 animate-pulse" 
                                  : "bg-blue-950/20 border-blue-800 text-blue-400"
                            }`}>
                              {sub.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-blue-400 hover:underline">
                            <a href={`#${sub.fileUrl}`} onClick={(e) => { e.preventDefault(); toast.success(`Simulating download of: ${sub.fileUrl}`); }}>
                              {sub.fileUrl}
                            </a>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-white">{sub.grade || "-"}</td>
                          <td className="py-3 px-4 text-right">
                            <Button 
                              onClick={() => { setSelectedSubId(sub.id); setGradingOpen(true); }}
                              size="sm" 
                              className="h-7 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200"
                            >
                              Grade
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* FACULTY CREATE ASSIGNMENT MODAL OVERLAY */}
        {createOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm grid place-items-center p-4">
            <Card className="bg-[#0F172A] border-slate-850 w-full max-w-md shadow-2xl text-left relative">
              <button onClick={() => setCreateOpen(false)} className="absolute top-2 right-2 h-9 w-9 flex items-center justify-center text-slate-400 hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-200">Post New Homework Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createAssignMut.mutate(newAssign);
                }} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Subject / Lecture Course</label>
                    <select
                      value={newAssign.subjectId}
                      onChange={(e) => setNewAssign({ ...newAssign, subjectId: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-850 text-slate-300 text-xs h-8 px-2 rounded focus:outline-none"
                      required
                    >
                      <option value="">Select subject...</option>
                      {subjects.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Assignment Title</label>
                    <Input
                      required
                      value={newAssign.title}
                      onChange={(e) => setNewAssign({ ...newAssign, title: e.target.value })}
                      placeholder="e.g. Normalization Theory Quiz Sheets"
                      className="bg-slate-950/40 border-slate-850 text-slate-200 text-xs h-8"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Problem Description</label>
                    <textarea
                      required
                      value={newAssign.description}
                      onChange={(e) => setNewAssign({ ...newAssign, description: e.target.value })}
                      placeholder="Enter detailed worksheet questions..."
                      rows={4}
                      className="w-full p-2.5 rounded bg-slate-950/40 border border-slate-850 text-slate-200 text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Submission Deadline</label>
                    <input
                      type="datetime-local"
                      required
                      value={newAssign.dueDate}
                      onChange={(e) => setNewAssign({ ...newAssign, dueDate: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-850 text-slate-300 text-xs h-8 px-3 rounded focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button type="submit" disabled={createAssignMut.isPending} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs h-8">
                      {createAssignMut.isPending ? "Broadcasting..." : "Broadcast Assignment"}
                    </Button>
                    <Button type="button" onClick={() => setCreateOpen(false)} variant="outline" className="border-slate-800 text-slate-400 text-xs h-8">
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STUDENT SUBMIT ASSIGNMENT MODAL OVERLAY */}
        {submitOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm grid place-items-center p-4">
            <Card className="bg-[#0F172A] border-slate-850 w-full max-w-sm shadow-2xl text-left relative">
              <button onClick={() => setSubmitOpen(false)} className="absolute top-2 right-2 h-9 w-9 flex items-center justify-center text-slate-400 hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-200">Submit Homework File</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (selectedAssignId) {
                    submitMut.mutate({ assignmentId: selectedAssignId, fileUrl: fileName || "relational-normalization.pdf" });
                  }
                }} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">File Name</label>
                    <Input
                      required
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="e.g. database_normal_form_solution.pdf"
                      className="bg-slate-950/40 border-slate-850 text-slate-200 text-xs h-8"
                    />
                  </div>

                  <div className="p-6 border border-dashed border-slate-800 rounded-lg text-center bg-slate-950/20">
                    <Upload className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                    <div className="text-xs font-semibold text-slate-300">Choose file or drag here</div>
                    <div className="text-[10px] text-slate-500 mt-1">Acceptable formats: PDF, DOCX, ZIP (max 10MB)</div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button type="submit" disabled={submitMut.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                      {submitMut.isPending ? "Submitting..." : "Upload & Submit"}
                    </Button>
                    <Button type="button" onClick={() => setSubmitOpen(false)} variant="outline" className="border-slate-800 text-slate-400 text-xs h-8">
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* FACULTY GRADING DESK MODAL OVERLAY */}
        {gradingOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm grid place-items-center p-4">
            <Card className="bg-[#0F172A] border-slate-850 w-full max-w-sm shadow-2xl text-left relative">
              <button onClick={() => setGradingOpen(false)} className="absolute top-2 right-2 h-9 w-9 flex items-center justify-center text-slate-400 hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-200">Grading Desk Evaluation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (selectedSubId) {
                    gradeMut.mutate({ id: selectedSubId, grade, feedback });
                  }
                }} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Select Grade Letter</label>
                    <select
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      className="w-full bg-slate-950/40 border border-slate-850 text-slate-300 text-xs h-8 px-2 rounded focus:outline-none"
                    >
                      <option value="A+">A+ (Outstanding)</option>
                      <option value="A">A (Excellent)</option>
                      <option value="B">B (Good)</option>
                      <option value="C">C (Pass)</option>
                      <option value="D">D (Marginal)</option>
                      <option value="F">F (Fail)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Feedback Comments</label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Provide helpful suggestions to the student..."
                      rows={3}
                      className="w-full p-2.5 rounded bg-slate-950/40 border border-slate-850 text-slate-200 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button type="submit" disabled={gradeMut.isPending} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-8">
                      {gradeMut.isPending ? "Submitting Grade..." : "Release Grade"}
                    </Button>
                    <Button type="button" onClick={() => setGradingOpen(false)} variant="outline" className="border-slate-800 text-slate-400 text-xs h-8">
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </ChatLayout>
  );
}
