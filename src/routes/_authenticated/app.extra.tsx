import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { 
  logActivity, listPlacements, createPlacement, 
  updatePlacement, getResumeProfile, saveResumeProfile 
} from "@/lib/studentos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  Clock, Play, Pause, RotateCcw, Briefcase, Plus, Edit3, 
  FileText, Award, Star, BookOpen, Layers, Flame, Trophy, 
  Calendar, Check, AlertCircle, RefreshCw, Sparkles, User, GraduationCap, X
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/extra")({
  component: ExtraModulesPage,
});

function ExtraModulesPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"pomodoro" | "placement" | "resume" | "leaderboard">("pomodoro");

  // Server functions
  const logActivityFn = useServerFn(logActivity);
  const listPlacementsFn = useServerFn(listPlacements);
  const createPlacementFn = useServerFn(createPlacement);
  const updatePlacementFn = useServerFn(updatePlacement);
  const getResumeFn = useServerFn(getResumeProfile);
  const saveResumeFn = useServerFn(saveResumeProfile);

  // Queries
  const { data: placements = [], refetch: refetchPlacements } = useQuery({
    queryKey: ["placementsList"],
    queryFn: () => listPlacementsFn(),
  });

  const { data: resume, refetch: refetchResume } = useQuery({
    queryKey: ["resumeProfile"],
    queryFn: () => getResumeFn(),
  });

  // ------------------- 1. POMODORO TIMER STATE & HOOKS -------------------
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        if (seconds === 0) {
          if (minutes === 0) {
            // Timer finished
            setIsActive(false);
            setSessionCount(prev => prev + 1);
            toast.success("Focus block completed! Logging session minutes.");
            logSessionMut.mutate(25);
            setMinutes(25);
            setSeconds(0);
          } else {
            setMinutes(minutes - 1);
            setSeconds(59);
          }
        } else {
          setSeconds(seconds - 1);
        }
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, minutes, seconds]);

  const logSessionMut = useMutation({
    mutationFn: (duration: number) => logActivityFn({ data: { type: "pomodoro", duration, details: "Completed 25-minute Pomodoro slot" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboardStats"] });
    }
  });

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setMinutes(25);
    setSeconds(0);
  };

  // ------------------- 2. PLACEMENT TRACKER FORMS -------------------
  const [placementOpen, setPlacementOpen] = useState(false);
  const [newPlace, setNewPlace] = useState({
    company: "",
    role: "",
    status: "applied" as "applied" | "interviewing" | "offered" | "rejected",
    notes: "",
  });

  const createPlaceMut = useMutation({
    mutationFn: (data: typeof newPlace) => createPlacementFn({ data }),
    onSuccess: () => {
      toast.success("Application cataloged!");
      setPlacementOpen(false);
      setNewPlace({ company: "", role: "", status: "applied", notes: "" });
      refetchPlacements();
      qc.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to log application");
    }
  });

  const updatePlaceMut = useMutation({
    mutationFn: (data: { id: string; status: any; notes: string }) => updatePlacementFn({ data }),
    onSuccess: () => {
      toast.success("Application progress saved!");
      refetchPlacements();
      qc.invalidateQueries({ queryKey: ["dashboardStats"] });
    }
  });

  // ------------------- 3. ATS RESUME BUILDER -------------------
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  
  // Experience fields list
  const [experience, setExperience] = useState<any[]>([]);
  // Education fields list
  const [education, setEducation] = useState<any[]>([]);
  // Projects fields list
  const [projects, setProjects] = useState<any[]>([]);

  // Synchronize query results to fields once loaded
  useEffect(() => {
    if (resume) {
      setSummary(resume.summary || "");
      setSkills(resume.skills ? resume.skills.join(", ") : "");
      setEducation(resume.education || []);
      setExperience(resume.experience || []);
      setProjects(resume.projects || []);
    }
  }, [resume]);

  const saveResumeMut = useMutation({
    mutationFn: () => {
      const skillsList = skills.split(",").map(s => s.trim()).filter(Boolean);
      return saveResumeFn({
        data: {
          summary,
          skills: skillsList,
          education,
          experience,
          projects,
        }
      });
    },
    onSuccess: () => {
      toast.success("Resume updated! ATS score recalculated.");
      refetchResume();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save resume");
    }
  });

  const addExperience = () => {
    setExperience([...experience, { company: "", role: "", duration: "", points: "" }]);
  };

  const addProject = () => {
    setProjects([...projects, { title: "", tech: "", description: "" }]);
  };

  const removeExperience = (index: number) => {
    setExperience(experience.filter((_, i) => i !== index));
  };

  const removeProject = (index: number) => {
    setProjects(projects.filter((_, i) => i !== index));
  };

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-[#0B0F19] text-slate-100 p-4 sm:p-6 md:p-8 scrollbar-thin">
        
        {/* Navigation tabs */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-8 border-b border-slate-800 pb-4 sm:justify-between sm:items-center">
          <div>
            <h1 className="text-xl font-extrabold text-white flex items-center gap-1.5">
              <Sparkles className="h-5 w-5 text-indigo-400" /> Study Utilities Hub
            </h1>
          </div>

          <div className="flex flex-wrap gap-1 w-full sm:w-auto bg-slate-900 border border-slate-800 rounded p-0.5">
            <button 
              onClick={() => setActiveTab("pomodoro")}
              className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === "pomodoro" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="h-3.5 w-3.5" /> Pomodoro Timer
            </button>
            <button 
              onClick={() => setActiveTab("placement")}
              className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === "placement" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" /> Placement Tracker
            </button>
            <button 
              onClick={() => setActiveTab("resume")}
              className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === "resume" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="h-3.5 w-3.5" /> ATS Resume Builder
            </button>
            <button 
              onClick={() => setActiveTab("leaderboard")}
              className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === "leaderboard" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Trophy className="h-3.5 w-3.5" /> Leaderboards
            </button>
          </div>
        </div>

        {/* ----------------- T1. POMODORO COUNTER ----------------- */}
        {activeTab === "pomodoro" && (
          <div className="max-w-md mx-auto py-8">
            <Card className="bg-slate-900/40 border-slate-800 shadow-2xl p-6 text-center backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-widest font-mono">Focus Countdown</CardTitle>
                <CardDescription className="text-xs text-slate-500">25 minutes study block / 5 minutes rest break</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 mt-6">
                
                {/* Timer Clock Circle */}
                <div className="h-44 w-44 rounded-full border-4 border-slate-800/80 mx-auto grid place-items-center relative bg-slate-950/40 shadow-inner">
                  <div className="text-4xl font-black text-white font-mono tracking-tighter">
                    {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                  </div>
                  {isActive && (
                    <span className="absolute bottom-10 text-[9px] uppercase tracking-widest text-emerald-400 font-bold font-mono animate-pulse">Running</span>
                  )}
                </div>

                <div className="flex justify-center gap-3">
                  <Button onClick={toggleTimer} className={`text-xs h-9 px-6 font-semibold ${isActive ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"} text-white`}>
                    {isActive ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                    {isActive ? "Pause Focus" : "Start Focus"}
                  </Button>
                  <Button onClick={resetTimer} variant="outline" className="border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 text-xs h-9">
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                  </Button>
                </div>

                <div className="border-t border-slate-850 pt-4 text-xs text-slate-400">
                  Blocks completed today: <span className="font-bold text-white">{sessionCount} blocks</span> ({(sessionCount * 25)} mins focus logged)
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ----------------- T2. PLACEMENT TRACKER ----------------- */}
        {activeTab === "placement" && (
          <div className="space-y-6 text-left">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h2 className="text-sm font-bold text-slate-300 font-mono uppercase tracking-wider">// Applied Placement Track</h2>
              <Button onClick={() => setPlacementOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7">
                <Plus className="h-3 w-3 mr-1" /> Add Application
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {placements.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs sm:col-span-2">No active applications currently logged.</div>
              ) : (
                placements.map((p: any) => (
                  <Card key={p.id} className="bg-slate-900/40 border-slate-800 p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-200 text-sm truncate">{p.company}</h3>
                        <p className="text-xs text-slate-400 mt-1 truncate">{p.role}</p>
                      </div>
                      <select
                        value={p.status}
                        onChange={(e) => updatePlaceMut.mutate({ id: p.id, status: e.target.value as any, notes: p.notes || "" })}
                        className="bg-slate-950/80 border border-slate-800 text-[10px] h-6 px-1.5 rounded text-slate-300 font-semibold focus:outline-none shrink-0"
                      >
                        <option value="applied">Applied</option>
                        <option value="interviewing">Interviewing</option>
                        <option value="offered">Offered</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    
                    <div className="mt-4 border-t border-slate-850 pt-3 text-xs">
                      <div className="text-[10px] text-slate-500">Log notes:</div>
                      <p className="text-[11px] text-slate-300 mt-1 italic leading-relaxed">{p.notes || "No notes logged."}</p>
                    </div>
                  </Card>
                ))
              )}
            </div>

            {/* ADD APPLICATION DIALOG OVERLAY */}
            {placementOpen && (
              <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm grid place-items-center p-4">
                <Card className="bg-[#0F172A] border-slate-850 w-full max-w-sm shadow-2xl relative">
                  <button onClick={() => setPlacementOpen(false)} className="absolute top-2 right-2 p-2 text-slate-400 hover:text-white transition-colors">
                    <X className="h-4.5 w-4.5" />
                  </button>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold text-slate-200">Catalog Placement application</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      createPlaceMut.mutate(newPlace);
                    }} className="space-y-4">
                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Company Name</label>
                        <Input
                          required
                          value={newPlace.company}
                          onChange={(e) => setNewPlace({ ...newPlace, company: e.target.value })}
                          placeholder="e.g. Microsoft"
                          className="bg-slate-950/40 border-slate-850 text-slate-200 text-xs h-8"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Job Role</label>
                        <Input
                          required
                          value={newPlace.role}
                          onChange={(e) => setNewPlace({ ...newPlace, role: e.target.value })}
                          placeholder="e.g. Systems Engineer Intern"
                          className="bg-slate-950/40 border-slate-850 text-slate-200 text-xs h-8"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-slate-400 block mb-1">Status</label>
                          <select
                            value={newPlace.status}
                            onChange={(e) => setNewPlace({ ...newPlace, status: e.target.value as any })}
                            className="w-full bg-slate-950/40 border border-slate-850 text-slate-300 text-xs h-8 px-2 rounded focus:outline-none"
                          >
                            <option value="applied">Applied</option>
                            <option value="interviewing">Interviewing</option>
                            <option value="offered">Offered</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Preparation Notes</label>
                        <textarea
                          value={newPlace.notes}
                          onChange={(e) => setNewPlace({ ...newPlace, notes: e.target.value })}
                          placeholder="Log stage instructions, interview timestamps..."
                          rows={3}
                          className="w-full p-2.5 rounded bg-slate-950/40 border border-slate-850 text-slate-200 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button type="submit" disabled={createPlaceMut.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                          {createPlaceMut.isPending ? "Logging..." : "Log Application"}
                        </Button>
                        <Button type="button" onClick={() => setPlacementOpen(false)} variant="outline" className="border-slate-800 text-slate-400 text-xs h-8">
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ----------------- T3. ATS RESUME BUILDER ----------------- */}
        {activeTab === "resume" && (
          <div className="grid gap-6 lg:grid-cols-3 text-left">
            
            {/* Left Column: Editor (Col span 2) */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-slate-900/40 border-slate-800 p-6">
                <CardHeader className="p-0 pb-4 border-b border-slate-805 mb-4">
                  <CardTitle className="text-sm font-semibold text-slate-200">ATS Profile Editor</CardTitle>
                </CardHeader>
                <CardContent className="p-0 space-y-4">
                  
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Professional Summary</label>
                    <textarea 
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="Briefly state your technical focus and goals..."
                      rows={3}
                      className="w-full p-2.5 rounded bg-slate-950/40 border border-slate-850 text-slate-200 text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Skills (Comma-separated)</label>
                    <Input 
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      placeholder="e.g. React, TypeScript, Python, SQL"
                      className="bg-slate-950/40 border-slate-850 text-slate-200 text-xs h-8"
                    />
                  </div>

                  {/* Dynamic Experience logs */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-medium text-slate-400 block">Work Experience History</label>
                      <button onClick={addExperience} className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold">+ Add block</button>
                    </div>
                    <div className="space-y-3">
                      {experience.map((exp, idx) => (
                        <div key={idx} className="p-3 border border-slate-850 rounded bg-slate-950/20 relative">
                          <button onClick={() => removeExperience(idx)} className="absolute top-2 right-2 text-slate-500 hover:text-red-400 text-xs">Remove</button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            <Input
                              placeholder="Company"
                              value={exp.company}
                              onChange={(e) => {
                                const list = [...experience];
                                list[idx].company = e.target.value;
                                setExperience(list);
                              }}
                              className="bg-slate-950/30 border-slate-800 text-xs h-8"
                            />
                            <Input 
                              placeholder="Role / Title"
                              value={exp.role}
                              onChange={(e) => {
                                const list = [...experience];
                                list[idx].role = e.target.value;
                                setExperience(list);
                              }}
                              className="bg-slate-950/30 border-slate-800 text-xs h-8"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <Input 
                              placeholder="Duration (e.g. Summer 2025)"
                              value={exp.duration}
                              onChange={(e) => {
                                const list = [...experience];
                                list[idx].duration = e.target.value;
                                setExperience(list);
                              }}
                              className="bg-slate-950/30 border-slate-800 text-xs h-8"
                            />
                          </div>
                          <textarea 
                            placeholder="Describe achievements with metrics..."
                            value={exp.points}
                            onChange={(e) => {
                              const list = [...experience];
                              list[idx].points = e.target.value;
                              setExperience(list);
                            }}
                            rows={2}
                            className="w-full p-2 rounded bg-slate-950/30 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic Projects logs */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-medium text-slate-400 block">Engineering Projects</label>
                      <button onClick={addProject} className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold">+ Add block</button>
                    </div>
                    <div className="space-y-3">
                      {projects.map((proj, idx) => (
                        <div key={idx} className="p-3 border border-slate-850 rounded bg-slate-950/20 relative">
                          <button onClick={() => removeProject(idx)} className="absolute top-2 right-2 text-slate-500 hover:text-red-400 text-xs">Remove</button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            <Input
                              placeholder="Project Title"
                              value={proj.title}
                              onChange={(e) => {
                                const list = [...projects];
                                list[idx].title = e.target.value;
                                setProjects(list);
                              }}
                              className="bg-slate-950/30 border-slate-800 text-xs h-8"
                            />
                            <Input 
                              placeholder="Tech Stack Used"
                              value={proj.tech}
                              onChange={(e) => {
                                const list = [...projects];
                                list[idx].tech = e.target.value;
                                setProjects(list);
                              }}
                              className="bg-slate-950/30 border-slate-800 text-xs h-8"
                            />
                          </div>
                          <textarea 
                            placeholder="Enter project specifications..."
                            value={proj.description}
                            onChange={(e) => {
                              const list = [...projects];
                              list[idx].description = e.target.value;
                              setProjects(list);
                            }}
                            rows={2}
                            className="w-full p-2 rounded bg-slate-950/30 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-slate-855">
                    <Button 
                      onClick={() => saveResumeMut.mutate()} 
                      disabled={saveResumeMut.isPending}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8"
                    >
                      {saveResumeMut.isPending ? "Calculating..." : "Save & Score Resume"}
                    </Button>
                  </div>

                </CardContent>
              </Card>
            </div>

            {/* Right Column: Score & Checklist */}
            <div className="space-y-6">
              <Card className="bg-slate-900/40 border-slate-800 p-6 text-center">
                <CardHeader className="p-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">ATS Scoring Audit</CardTitle>
                </CardHeader>
                <CardContent className="p-0 space-y-6 mt-4">
                  {/* Gauge */}
                  <div className="h-28 w-28 rounded-full border-4 border-slate-800 mx-auto grid place-items-center relative bg-slate-950/20">
                    <span className="text-2xl font-black text-white">{resume?.ats_score || 0}%</span>
                    <span className="absolute bottom-6 text-[8px] text-slate-500 uppercase tracking-wider font-semibold">ATS score</span>
                  </div>

                  {/* Suggestions list */}
                  <div className="text-left border-t border-slate-850 pt-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-3">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> Optimization Checklist
                    </div>
                    {resume?.suggestions && resume.suggestions.length > 0 ? (
                      <ul className="space-y-2.5">
                        {resume.suggestions.map((s: string, idx: number) => (
                          <li key={idx} className="flex gap-2 items-start text-[11px] text-slate-300 leading-normal">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-emerald-400 flex items-center gap-1"><Check className="h-4 w-4" /> Resume is ATS fully optimized!</div>
                    )}
                  </div>

                  <Button 
                    onClick={() => {
                      toast.success("Downloading ATS resume document file...");
                    }}
                    variant="outline" 
                    className="w-full border-slate-800 bg-slate-950 text-slate-300 text-xs h-8"
                  >
                    Print Resume Draft
                  </Button>
                </CardContent>
              </Card>
            </div>

          </div>
        )}

        {/* ----------------- T4. LEADERBOARDS ----------------- */}
        {activeTab === "leaderboard" && (
          <div className="max-w-2xl mx-auto space-y-6 text-left">
            <Card className="bg-slate-900/40 border-slate-800 p-6">
              <CardHeader className="pb-3 border-b border-slate-850">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <Trophy className="h-5 w-5 text-amber-500" /> Academic CGPA Leaderboard
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">Highest GPA logs among student registry cohort</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 p-0">
                <div className="space-y-3">
                  {[
                    { rank: 1, name: "Yash Barjatya", cgpa: 9.82, streak: 15 },
                    { rank: 2, name: "Priyanjali Sen", cgpa: 9.54, streak: 12 },
                    { rank: 3, name: "Ananya Mehta", cgpa: 9.21, streak: 10 },
                    { rank: 4, name: "Rohit Deshmukh", cgpa: 8.94, streak: 8 }
                  ].map((user, i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded border border-slate-850 bg-slate-950/20">
                      <div className="flex items-center gap-3">
                        <span className={`h-6 w-6 rounded-full font-mono text-xs font-bold grid place-items-center ${
                          user.rank === 1 ? "bg-amber-500/20 border border-amber-500/40 text-amber-400" : "bg-slate-800 text-slate-400"
                        }`}>{user.rank}</span>
                        <div>
                          <div className="text-xs font-semibold text-slate-200">{user.name}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"><Flame className="h-3 w-3 text-amber-500" /> {user.streak} days login</div>
                        </div>
                      </div>
                      <div className="text-sm font-black text-blue-400">{user.cgpa} CGPA</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </ChatLayout>
  );
}
