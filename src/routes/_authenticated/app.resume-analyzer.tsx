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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { analyzeResume } from "@/lib/resume.functions";
import {
  FileCheck2,
  Key,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Plus
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/resume-analyzer")({
  component: ResumeAnalyzerPage,
});

function ResumeAnalyzerPage() {
  const analyzeFn = useServerFn(analyzeResume);

  // Form states
  const [fileName, setFileName] = useState("John_Doe_SDE_Resume.pdf");
  const [fileContent, setFileContent] = useState(""); // base64 string
  const [jobDescription, setJobDescription] = useState("Seeking a Software Development Engineer with strong proficiency in Data Structures, Relational Databases (SQL), Operating Systems, and React/TypeScript web frameworks.");
  
  // Custom API key states
  const [provider, setProvider] = useState<"Gemini" | "OpenAI">("Gemini");
  const [customKey, setCustomKey] = useState("");
  const [showKeyExpander, setShowKeyExpander] = useState(false);

  // Result state
  const [result, setResult] = useState<any>({
    matchPercentage: 88,
    atsCompatibilityScore: 92,
    strengthAreas: [
      "Proficient in Core Java, Python, and SQL database querying.",
      "Hands-on project experience with React, REST APIs, and SQLite.",
      "Clear bullet points formatted with action verbs and quantifiable metrics."
    ],
    missingKeywords: ["Docker", "Kubernetes", "Redis Caching", "CI/CD Pipeline"],
    grammarStyleIssues: [
      "Avoid passive phrasing in project descriptions — use active action verbs like 'Engineered', 'Architected', 'Deployed'."
    ],
    tailoredBulletSuggestions: [
      "Architected a full-stack academic monitoring system serving 1,140 students with sub-100ms API query latency.",
      "Implemented spaced-repetition study planner algorithms, boosting student test scores by 24%."
    ]
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split(".").pop()?.toLowerCase();
    if (fileExt !== "pdf" && fileExt !== "docx") {
      toast.error("Only PDF and DOCX files are supported.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(",")[1];
      setFileContent(base64String);
      setFileName(file.name);
      toast.success(`Loaded resume: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!fileContent) {
        throw new Error("Please upload a resume file.");
      }
      if (!jobDescription.trim()) {
        throw new Error("Please paste a target job description.");
      }

      return analyzeFn({
        data: {
          fileName,
          fileContent,
          jobDescription,
          custom_key: customKey || undefined,
          provider: customKey ? provider : undefined,
        }
      });
    },
    onSuccess: (data) => {
      setResult(data.analysis);
      toast.success("Resume analyzed successfully!");
    },
    onError: (error: any) => {
      console.error(error);
      toast.error(error.message || "Resume analysis failed. Please try again.");
    },
  });

  // Score color helper
  const getScoreStyles = (score: number) => {
    if (score >= 80) return { text: "text-green-400", border: "border-green-500/20", bg: "bg-green-500/10" };
    if (score >= 60) return { text: "text-yellow-400", border: "border-yellow-500/20", bg: "bg-yellow-500/10" };
    return { text: "text-red-400", border: "border-red-500/20", bg: "bg-red-500/10" };
  };

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-background px-4 py-6 text-foreground sm:px-6 md:px-10">
        
        {/* Banner */}
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-surface/60 p-6 text-center shadow-lg md:p-8">
          <div className="absolute top-0 left-1/2 -z-10 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-gradient sm:text-5xl">
            Resume Analyzer & ATS Optimizer
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            Bridge the gap between your resume and your dream role. Upload your resume, paste the target job description, and get instant score optimization.
          </p>
        </div>

        {/* Layout Grid */}
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          
          {/* Inputs Section */}
          <div className="space-y-6">
            
            {/* File Upload card */}
            <Card className="border-border bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <Upload className="h-5 w-5 text-primary" />
                  Upload Resume
                </CardTitle>
                <CardDescription>
                  Upload your resume in PDF or Word (DOCX) format.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                <Label
                  htmlFor="file-upload"
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/20 py-8 px-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <span className="text-sm font-semibold">
                    {fileName ? fileName : "Click to select a file"}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Supports PDF and DOCX documents
                  </span>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </Label>

                {fileName && (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-green-400 font-medium">
                      <CheckCircle className="h-4 w-4" /> Ready: {fileName}
                    </span>
                    <button
                      onClick={() => {
                        setFileName("");
                        setFileContent("");
                      }}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Job Description card */}
            <Card className="border-border bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <FileCheck2 className="h-5 w-5 text-primary" />
                  Paste Job Description
                </CardTitle>
                <CardDescription>
                  Input the target job listing description to evaluate alignment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="We are looking for a Software Engineer with experience in React, Python, and SQL..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="min-h-[220px] resize-none"
                />

                {/* Optional Key Expander */}
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

                <Button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || !fileContent || !jobDescription.trim()}
                  className="w-full glow-primary"
                  size="lg"
                >
                  {mutation.isPending ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" /> Running ATS Compatibility analysis...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4 text-primary-foreground" /> Analyze Compatibility & Optimize
                    </>
                  )}
                </Button>

              </CardContent>
            </Card>

          </div>

          {/* Results Section */}
          <div className="flex flex-col gap-6">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Analysis Results
            </h2>

            {!result ? (
              <Card className="flex flex-1 flex-col items-center justify-center border-dashed border-border bg-card/20 p-6 text-center text-muted-foreground sm:p-8">
                <FileCheck2 className="mb-4 h-12 w-12 text-muted-foreground/30 animate-pulse" />
                <p className="max-w-xs text-sm">
                  Upload a resume, paste a job description, and run analysis to view your compatibility rating and optimization guide.
                </p>
              </Card>
            ) : (
              <div className="space-y-6 flex-1">
                
                {/* Score Summary Card */}
                <Card className="border-border bg-surface/50">
                  <CardContent className="p-6">
                    <div className="grid gap-6 sm:grid-cols-3 items-center">
                      <div className="text-center sm:border-r sm:border-border/60 py-2 flex flex-col justify-center items-center">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ATS Match</h4>
                        <div className={`font-display text-5xl font-extrabold ${getScoreStyles(result.ats_score).text} my-2`}>
                          {result.ats_score}%
                        </div>
                        <Badge className={`${getScoreStyles(result.ats_score).bg} ${getScoreStyles(result.ats_score).text} border ${getScoreStyles(result.ats_score).border} font-semibold`}>
                          {result.compatibility_rating}
                        </Badge>
                      </div>
                      <div className="sm:col-span-2 space-y-2">
                        <h4 className="font-display text-base font-semibold">📝 Match Summary</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {result.overall_summary}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Breakdown Tabs */}
                <Tabs defaultValue="skills" className="w-full bg-card/20 border border-border rounded-xl overflow-hidden p-4">
                  <TabsList className="grid grid-cols-1 sm:grid-cols-3 bg-surface border border-border/60">
                    <TabsTrigger value="skills" className="text-xs">Skills Match</TabsTrigger>
                    <TabsTrigger value="gaps" className="text-xs">Gaps & Fixes</TabsTrigger>
                    <TabsTrigger value="rewrites" className="text-xs">Bullet Rewrites</TabsTrigger>
                  </TabsList>

                  <TabsContent value="skills" className="space-y-4 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-3">
                        <h5 className="text-xs font-semibold text-green-400 flex items-center gap-2">
                          ✔ Matching Keywords & Skills
                        </h5>
                        <div className="flex flex-wrap gap-1">
                          {result.matching_skills && result.matching_skills.length > 0 ? (
                            result.matching_skills.map((skill: string) => (
                              <Badge key={skill} variant="secondary" className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20">
                                {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No matching keywords.</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
                        <h5 className="text-xs font-semibold text-red-400 flex items-center gap-2">
                          ✖ Missing Keywords & Skills
                        </h5>
                        <div className="flex flex-wrap gap-1">
                          {result.missing_skills && result.missing_skills.length > 0 ? (
                            result.missing_skills.map((skill: string) => (
                              <Badge key={skill} variant="secondary" className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20">
                                {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No major missing keywords.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="gaps" className="space-y-3 pt-4">
                    <h5 className="text-xs font-semibold text-muted-foreground mb-2">Actionable Gaps & Fixes</h5>
                    {result.gap_analysis && result.gap_analysis.map((gap: string, idx: number) => (
                      <div key={idx} className="flex gap-3 items-start border border-border/40 bg-surface/30 rounded-lg p-3 text-xs leading-relaxed">
                        <AlertCircle className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{gap}</span>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="rewrites" className="space-y-4 pt-4 max-h-[350px] overflow-y-auto pr-2">
                    <h5 className="text-xs font-semibold text-muted-foreground">Tailored Bullet-by-Bullet Rewrites</h5>
                    {result.rewrites && result.rewrites.map((item: any, idx: number) => (
                      <Card key={idx} className="border-l-4 border-l-primary border border-border bg-surface/40 p-4 space-y-3">
                        <div>
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide block">Original bullet point</span>
                          <p className="text-xs text-muted-foreground line-through mt-0.5">{item.original}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-green-400 uppercase tracking-wide block">Optimized ATS rewrite</span>
                          <p className="text-xs text-foreground font-semibold mt-0.5">{item.rewrite}</p>
                        </div>
                        <div className="border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                          <strong className="text-primary font-medium">Strategy:</strong> {item.reason}
                        </div>
                      </Card>
                    ))}
                  </TabsContent>
                </Tabs>

              </div>
            )}

          </div>

        </div>

      </div>
    </ChatLayout>
  );
}
