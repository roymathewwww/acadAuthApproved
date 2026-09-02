import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { generateCareerRoadmap } from "@/lib/roadmap.functions";
import {
  Compass,
  Key,
  GraduationCap,
  Calendar,
  Sparkles,
  TrendingUp,
  BookOpen,
  Award,
  Clock,
  Briefcase,
  AlertCircle,
  FileCode,
  User,
  Heart,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/career-roadmap")({
  component: CareerRoadmapPage,
});

function CareerRoadmapPage() {
  const roadmapFn = useServerFn(generateCareerRoadmap);

  // Form states
  const [name, setName] = useState("Yash Barjatya");
  const [degree, setDegree] = useState("MCA Student");
  const [semester, setSemester] = useState("2nd Year");
  const [currentSkills, setCurrentSkills] = useState("HTML, CSS, JavaScript, Basic Git");
  const [certifications, setCertifications] = useState("");
  const [projects, setProjects] = useState("");
  const [targetRole, setTargetRole] = useState("Frontend Engineer");
  const [timeline, setTimeline] = useState("6 Months");
  const [studyHours, setStudyHours] = useState(15);
  
  // Custom API key states
  const [provider, setProvider] = useState<"Gemini" | "OpenAI">("Gemini");
  const [customKey, setCustomKey] = useState("");
  const [showKeyExpander, setShowKeyExpander] = useState(false);

  // Result state
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let timelineMonths = 6;
      if (timeline.includes("3")) timelineMonths = 3;
      if (timeline.includes("12")) timelineMonths = 12;
      if (timeline.includes("24")) timelineMonths = 24;

      return roadmapFn({
        data: {
          name,
          degree,
          semester,
          current_skills: currentSkills,
          certifications,
          projects,
          target_role: targetRole,
          timeline_months: timelineMonths,
          study_hours: studyHours,
          custom_key: customKey || undefined,
          provider: customKey ? provider : undefined,
        }
      });
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success("Personalized roadmap generated successfully!");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Roadmap generation failed. Please try again.");
    },
  });

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-background px-4 py-4 text-foreground sm:px-6 sm:py-6 md:px-10">
        
        {/* Banner */}
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-surface/60 p-6 text-center shadow-lg md:p-8">
          <div className="absolute top-0 left-1/2 -z-10 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-gradient sm:text-5xl">
            CareerPilot AI
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            Personalized month-by-month roadmaps, skills gaps analytics, learning resources, and mentor schedules — tailored to target roles.
          </p>
        </div>

        {/* Form and Quick Dash */}
        <div className="grid gap-6 lg:gap-8 lg:grid-cols-2">
          
          {/* Assessment Form */}
          <Card className="border-border bg-card/40 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 font-display text-xl">
                <Compass className="h-5 w-5 text-primary animate-pulse" />
                Career Assessment Form
              </CardTitle>
              <CardDescription>
                Provide details about your academic progress and career goals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              
              {/* Optional Keys Expander */}
              <div className="rounded-lg border border-border bg-surface/40 px-4 py-2">
                <button
                  type="button"
                  onClick={() => setShowKeyExpander(!showKeyExpander)}
                  className="flex w-full items-center justify-between py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    🔑 Optional: Use Custom API Keys
                  </span>
                  {showKeyExpander ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showKeyExpander && (
                  <div className="mt-3 space-y-3 pb-2 pt-1">
                    <div className="grid gap-2">
                      <Label htmlFor="provider" className="text-xs">LLM Provider</Label>
                      <Select
                        value={provider}
                        onValueChange={(val: any) => setProvider(val)}
                      >
                        <SelectTrigger id="provider" className="h-9">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Gemini">Gemini</SelectItem>
                          <SelectItem value="OpenAI">OpenAI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="apiKey" className="text-xs">API Key</Label>
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder="Enter your LLM API Key"
                        value={customKey}
                        onChange={(e) => setCustomKey(e.target.value)}
                        className="h-9"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Leave blank to use the local heuristics database automatically.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Degree / Semester */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="degree">Current Degree</Label>
                  <Select value={degree} onValueChange={setDegree}>
                    <SelectTrigger id="degree">
                      <SelectValue placeholder="Select Degree" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MCA Student">MCA Student</SelectItem>
                      <SelectItem value="BCA Student">BCA Student</SelectItem>
                      <SelectItem value="Engineering (B.Tech)">Engineering (B.Tech)</SelectItem>
                      <SelectItem value="Fresher / Graduate">Fresher / Graduate</SelectItem>
                      <SelectItem value="Career Switcher">Career Switcher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="semester">Semester / Year</Label>
                  <Select value={semester} onValueChange={setSemester}>
                    <SelectTrigger id="semester">
                      <SelectValue placeholder="Select Semester/Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1st Year">1st Year</SelectItem>
                      <SelectItem value="2nd Year">2nd Year</SelectItem>
                      <SelectItem value="3rd Year">3rd Year</SelectItem>
                      <SelectItem value="4th Year">4th Year</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Current Skills */}
              <div className="grid gap-2">
                <Label htmlFor="currentSkills">Current Skills</Label>
                <Textarea
                  id="currentSkills"
                  placeholder="e.g. HTML, CSS, JavaScript, Basic Git"
                  value={currentSkills}
                  onChange={(e) => setCurrentSkills(e.target.value)}
                  className="min-h-[70px] resize-none"
                />
              </div>

              {/* Certifications / Projects */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="certifications">Certifications Completed</Label>
                  <Input
                    id="certifications"
                    placeholder="e.g. FreeCodeCamp, Azure Fund."
                    value={certifications}
                    onChange={(e) => setCertifications(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="projects">Completed Projects</Label>
                  <Input
                    id="projects"
                    placeholder="e.g. Personal Portfolio website"
                    value={projects}
                    onChange={(e) => setProjects(e.target.value)}
                  />
                </div>
              </div>

              {/* Role / Timeline */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="targetRole">Target Role</Label>
                  <Select value={targetRole} onValueChange={setTargetRole}>
                    <SelectTrigger id="targetRole">
                      <SelectValue placeholder="Select Target Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Frontend Engineer">Frontend Engineer</SelectItem>
                      <SelectItem value="Backend Engineer">Backend Engineer</SelectItem>
                      <SelectItem value="Full Stack Engineer">Full Stack Engineer</SelectItem>
                      <SelectItem value="Data Scientist / ML Engineer">Data Scientist / ML Engineer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="timeline">Expected Timeline</Label>
                  <Select value={timeline} onValueChange={setTimeline}>
                    <SelectTrigger id="timeline">
                      <SelectValue placeholder="Select Timeline" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3 Months">3 Months</SelectItem>
                      <SelectItem value="6 Months">6 Months</SelectItem>
                      <SelectItem value="12 Months">12 Months</SelectItem>
                      <SelectItem value="24 Months">24 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Hours Slider */}
              <div className="grid gap-3 pt-2">
                <div className="flex justify-between text-sm">
                  <Label htmlFor="studyHours">Available Study Hours / Week</Label>
                  <span className="font-mono font-semibold text-primary">{studyHours} hours</span>
                </div>
                <Slider
                  id="studyHours"
                  min={5}
                  max={50}
                  step={5}
                  value={[studyHours]}
                  onValueChange={(val) => setStudyHours(val[0])}
                  className="py-1.5"
                />
              </div>

              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="w-full glow-primary"
                size="lg"
              >
                {mutation.isPending ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" /> Analyzing profile & compiling roadmap...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 text-primary-foreground" /> Generate Personalized Roadmap
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Analytics Overview Column */}
          <div className="flex flex-col gap-6">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Career Analytics Dashboard
            </h2>

            {!result ? (
              <Card className="flex flex-1 flex-col items-center justify-center border-dashed border-border bg-card/20 p-8 text-center text-muted-foreground">
                <Compass className="mb-4 h-12 w-12 text-muted-foreground/30 animate-pulse" />
                <p className="max-w-xs text-sm">
                  Fill out the Career Assessment Form and click generate to view your personalized roadmap and placement diagnostics.
                </p>
              </Card>
            ) : (
              <div className="grid gap-6 flex-1">
                {/* Metric grid */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="bg-surface/50 border-border text-center">
                    <CardHeader className="p-4 pb-1">
                      <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Job Readiness</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                      <div className="font-display text-4xl font-extrabold text-primary">
                        {result.readiness_score}%
                      </div>
                      <span className="text-[10px] text-muted-foreground">Industry target is 80%+</span>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-surface/50 border-border text-center">
                    <CardHeader className="p-4 pb-1">
                      <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skill Gap</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                      <div className="font-display text-4xl font-extrabold text-indigo-400">
                        {result.skill_gap_score}%
                      </div>
                      <span className="text-[10px] text-muted-foreground">Missing key target skills</span>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-surface/50 border-border text-center">
                    <CardHeader className="p-4 pb-1">
                      <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Difficulty</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                      <div className="font-display text-2xl font-extrabold text-sky-400 mt-2">
                        {result.difficulty}
                      </div>
                      <span className="text-[10px] text-muted-foreground">Based on timeline & gaps</span>
                    </CardContent>
                  </Card>
                </div>

                {/* Strengths & Gaps */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                    <h4 className="text-sm font-semibold text-green-400 flex items-center gap-2 mb-3">
                      ✔ Matching Strengths
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {result.matching_skills && result.matching_skills.length > 0 ? (
                        result.matching_skills.map((skill: string) => (
                          <Badge key={skill} variant="secondary" className="bg-green-500/10 text-green-400 border border-green-500/20">
                            {skill}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No matching core skills identified.</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2 mb-3">
                      ✖ Skill Gaps / Weaknesses
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {result.missing_skills && result.missing_skills.length > 0 ? (
                        result.missing_skills.map((skill: string) => (
                          <Badge key={skill} variant="secondary" className="bg-red-500/10 text-red-400 border border-red-500/20">
                            {skill}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">All target skills are matched!</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Indicators */}
                <Card className="bg-surface/30 border-border p-4">
                  <h4 className="text-sm font-semibold text-muted-foreground mb-4">Analytics Indicators</h4>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Skill Completion Rate</span>
                        <span>{result.readiness_score}%</span>
                      </div>
                      <Progress value={result.readiness_score} className="h-1.5 bg-border [&>div]:bg-primary" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Project & Portfolio Completion</span>
                        <span>{projects.trim() ? 60 : 15}%</span>
                      </div>
                      <Progress value={projects.trim() ? 60 : 15} className="h-1.5 bg-border [&>div]:bg-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Interview Readiness</span>
                        <span>{Math.min(100, Math.max(10, result.readiness_score - 15))}%</span>
                      </div>
                      <Progress value={Math.min(100, Math.max(10, result.readiness_score - 15))} className="h-1.5 bg-border [&>div]:bg-sky-400" />
                    </div>
                  </div>
                </Card>
              </div>
            )}

          </div>
        </div>

        {result && (
          <div className="mt-12 space-y-12">
            
            {/* Month Roadmap */}
            <div className="space-y-4">
              <div className="border-b border-border pb-2">
                <h3 className="font-display text-2xl font-bold tracking-tight text-gradient flex items-center gap-2">
                  🗺️ Month-by-Month Career Roadmap
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Follow this interactive, progressive month-by-month plan designed to build technical competence and prepare you for hiring loops.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {result.roadmap && result.roadmap.map((item: any, idx: number) => (
                  <Card key={idx} className="border-border bg-card/60 relative overflow-hidden transition-all hover:-translate-y-1 hover:border-primary/30">
                    <div className="absolute top-0 left-0 h-1 w-full bg-primary" />
                    <CardHeader className="pb-3">
                      <div className="font-mono text-xs uppercase tracking-widest text-primary">
                        {item.month}
                      </div>
                      <CardTitle className="font-display text-lg font-semibold mt-1">
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">📚 Topics to Master</span>
                        <ul className="list-inside list-disc space-y-0.5 text-xs text-foreground/80">
                          {Array.isArray(item.topics) ? (
                            item.topics.map((topic: string, i: number) => (
                              <li key={i}>{topic}</li>
                            ))
                          ) : (
                            <li>{item.topics}</li>
                          )}
                        </ul>
                      </div>
                      
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">💻 Practice Goals</span>
                        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">{item.practice}</p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">🚀 Recommended Project</span>
                        <p className="text-xs text-foreground/80 leading-relaxed">{item.project}</p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">🤝 Placement & Interview Prep</span>
                        <p className="text-xs text-foreground/80 leading-relaxed">{item.interview}</p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">📂 Portfolio Improvements</span>
                        <p className="text-xs text-foreground/80 leading-relaxed">{item.portfolio}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* AI Mentor Checkpoints */}
            <div className="space-y-4">
              <div className="border-b border-border pb-2">
                <h3 className="font-display text-2xl font-bold tracking-tight text-gradient flex items-center gap-2">
                  🧑‍🏫 AI Mentor Checkpoints
                </h3>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-surface/30 border-border p-4 sm:p-6 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                      <Award className="h-4 w-4" /> Weekly Goal
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {result.mentor?.weekly_goal}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-400 flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Daily Learning Target
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {result.mentor?.daily_target}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-sky-400 flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Study Schedule
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {result.mentor?.schedule}
                    </p>
                  </div>
                </Card>
                
                <Card className="bg-surface/30 border-border p-4 sm:p-6">
                  <h4 className="text-sm font-semibold text-primary flex items-center gap-2 mb-3">
                    💡 Motivation Checkpoints
                  </h4>
                  <ul className="space-y-2">
                    {result.mentor?.checkpoints && result.mentor.checkpoints.map((point: string, i: number) => (
                      <li key={i} className="flex gap-2.5 items-start text-xs text-muted-foreground leading-relaxed">
                        <span className="font-bold text-primary">0{i+1}</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>

            {/* Industry Insights & Learning Resources */}
            <div className="space-y-4 pb-12">
              <div className="border-b border-border pb-2">
                <h3 className="font-display text-2xl font-bold tracking-tight text-gradient flex items-center gap-2">
                  💡 Industry Insights & Learning Resources
                </h3>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Industry Trends */}
                <Card className="bg-surface/30 border-border p-4 sm:p-6 space-y-4">
                  <h4 className="text-sm font-semibold text-primary flex items-center gap-2 border-b border-border/40 pb-2">
                    <TrendingUp className="h-4 w-4" /> Industry Trends
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground block font-medium">Average Salary Package</span>
                      <span className="font-bold text-foreground mt-0.5 block">{result.role_details?.salary}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block font-medium">Market Demand Level</span>
                      <span className="font-bold text-foreground mt-0.5 block">{result.role_details?.demand}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block font-medium">Future Growth Potential</span>
                      <span className="font-bold text-foreground mt-0.5 block">{result.role_details?.growth}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block font-medium">Top Hiring Companies</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.role_details?.companies && result.role_details.companies.map((c: string) => (
                          <Badge key={c} variant="outline" className="text-[10px] bg-background border-border py-0.5">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Learning Resources */}
                <Card className="bg-surface/30 border-border p-4 sm:p-6">
                  <h4 className="text-sm font-semibold text-primary flex items-center gap-2 border-b border-border/40 pb-2 mb-4">
                    <BookOpen className="h-4 w-4" /> Premium Learning Resources
                  </h4>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                    {result.role_details?.resources && Object.entries(result.role_details.resources).map(([topic, links]: [string, any]) => (
                      <div key={topic} className="space-y-1.5 border-b border-border/20 pb-3 last:border-0 last:pb-0">
                        <span className="text-xs font-bold text-foreground">{topic}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                          <a href={links.youtube} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">📺 Video Playlist</a>
                          <a href={links.doc} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">📖 Official Docs</a>
                          <a href={links.platform} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">🛠️ Practice Platform</a>
                        </div>
                        <p className="text-[10px] text-muted-foreground italic mt-1">
                          <strong>Recommended Project:</strong> {links.project}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

          </div>
        )}

      </div>
    </ChatLayout>
  );
}
