import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  uploadAndAnalyzePaper,
  listPaperAnalyses,
  deletePaperAnalysis,
} from "@/lib/paper.functions";
import {
  BookOpen,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  BrainCircuit,
  HelpCircle,
  FileCheck2,
  Trash2,
  Download,
  Gauge,
  Activity,
  History,
  CornerDownLeft,
  ChevronRight,
  TrendingUp,
  Award,
  Key,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/paper-simplifier")({
  component: PaperSimplifierPage,
});

function PaperSimplifierPage() {
  const queryClient = useQueryClient();
  const analyzePaperFn = useServerFn(uploadAndAnalyzePaper);
  const listAnalysesFn = useServerFn(listPaperAnalyses);
  const deleteAnalysisFn = useServerFn(deletePaperAnalysis);

  // Form states
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState(""); // base64 string
  
  // Custom API key states
  const [provider, setProvider] = useState<"Gemini" | "OpenAI">("Gemini");
  const [customKey, setCustomKey] = useState("");
  const [showKeyExpander, setShowKeyExpander] = useState(false);

  // Loaded result state
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [selectedMeta, setSelectedMeta] = useState<any>(null);

  // Fetch history
  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["paperAnalyses"],
    queryFn: () => listAnalysesFn(),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!fileContent) throw new Error("Please upload a research paper.");
      return analyzePaperFn({
        data: {
          fileName,
          fileContent,
          custom_key: customKey || undefined,
          provider: customKey ? provider : undefined,
        }
      });
    },
    onSuccess: (data) => {
      setSelectedResult(data.result);
      setSelectedMeta({
        id: data.id,
        file_name: data.file_name,
        num_pages: data.num_pages,
        upload_date: new Date().toISOString(),
        status: data.status
      });
      queryClient.invalidateQueries({ queryKey: ["paperAnalyses"] });
      toast.success("Research paper parsed and analyzed successfully!");
    },
    onError: (error: any) => {
      console.error(error);
      toast.error(error.message || "Failed to analyze paper. Check configuration.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteAnalysisFn({ data: { id } });
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["paperAnalyses"] });
      if (selectedMeta?.id === id) {
        setSelectedResult(null);
        setSelectedMeta(null);
      }
      toast.success("Analysis deleted.");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please upload a valid PDF research paper.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File size exceeds 20MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(",")[1];
      setFileContent(base64String);
      setFileName(file.name);
      toast.success(`PDF selected: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectHistory = (item: any) => {
    setSelectedResult(item.result);
    setSelectedMeta({
      id: item.id,
      file_name: item.file_name,
      num_pages: item.num_pages,
      upload_date: item.upload_date,
      status: item.status
    });
    setFileName(item.file_name);
    toast.info(`Loaded analysis: ${item.file_name}`);
  };

  const downloadRevisionAsTxt = () => {
    if (!selectedResult || !fileName) return;

    const content = `STUDENTOS PAPER SIMPLIFIER - QUICK REVISION SHEET\n` +
      `Paper Title: ${fileName}\n` +
      `Analyzed Date: ${new Date(selectedMeta?.upload_date).toLocaleDateString()}\n` +
      `Estimated Pages: ${selectedMeta?.num_pages}\n\n` +
      `======================================================================\n` +
      `EXAMINATION SUMMARY:\n` +
      `======================================================================\n` +
      `${selectedResult.quickRevision.summary}\n\n` +
      `======================================================================\n` +
      `KEY REVISION BULLET POINTS:\n` +
      `======================================================================\n` +
      selectedResult.quickRevision.bulletPoints.map((pt: string, idx: number) => `[${idx + 1}] ${pt}`).join("\n\n") +
      `\n\nGenerated via StudentOS AI Research Assistant.`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.[^/.]+$/, "")}_RevisionSheet.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Color helper for viva questions difficulty
  const getDifficultyColor = (level: string) => {
    if (level === "Easy") return "bg-green-500/10 text-green-700 border-green-500/20";
    if (level === "Hard") return "bg-red-500/10 text-red-700 border-red-500/20";
    return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateString;
    }
  };

  return (
    <ChatLayout activeThreadId={null}>
      {/* Light Theme Container Workspace */}
      <div className="h-full overflow-y-auto bg-slate-50 text-slate-800 light flex flex-col md:flex-row">
        
        {/* Main Workspace */}
        <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-10">
          
          {/* Header */}
          <div className="border-b border-slate-200 pb-5 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
                <BookOpen className="h-7 w-7 text-blue-600 shrink-0" />
                Paper Simplifier
              </h1>
              <p className="text-xs text-slate-500 mt-1.5 max-w-xl leading-relaxed">
                Upload a research paper and receive AI-powered summaries, explanations, and viva preparation tools. Ideal for MCA, BCA, and Engineering students.
              </p>
            </div>
            
            {/* Quick Stats Panel */}
            {selectedMeta && (
              <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex gap-4 text-xs shadow-sm">
                <div>
                  <span className="text-slate-400 block font-medium">Pages</span>
                  <span className="font-bold text-slate-700">{selectedMeta.num_pages}</span>
                </div>
                <div className="border-l border-slate-200 pl-4">
                  <span className="text-slate-400 block font-medium">Status</span>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold px-2 py-0">
                    {selectedMeta.status}
                  </Badge>
                </div>
                <div className="border-l border-slate-200 pl-4">
                  <span className="text-slate-400 block font-medium">Uploaded</span>
                  <span className="font-bold text-slate-700">{formatDate(selectedMeta.upload_date)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-3">
            
            {/* Left Col: Upload & Setup */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Upload Card */}
              <Card className="bg-white border-slate-200/80 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="font-display text-base font-bold text-blue-900 flex items-center gap-2">
                    <Upload className="h-4.5 w-4.5 text-blue-600" />
                    Upload Research Paper
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Drag and drop your paper PDF file to start the extraction.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  
                  <Label
                    htmlFor="paper-upload"
                    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100/50 py-8 px-4 text-center cursor-pointer hover:border-blue-500/50 transition-colors"
                  >
                    <FileText className="h-9 w-9 text-slate-400 mb-3" />
                    <span className="text-xs font-semibold text-slate-700">
                      {fileName ? fileName : "Click to select a research PDF"}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1">
                      PDF documents up to 20MB
                    </span>
                    <input
                      id="paper-upload"
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </Label>

                  {/* Optional Key Expander */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setShowKeyExpander(!showKeyExpander)}
                      className="flex w-full items-center justify-between py-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      <span className="flex items-center gap-1.5">
                        <Key className="h-3.5 w-3.5" />
                        🔑 Optional: Use Custom API Keys
                      </span>
                      {showKeyExpander ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {showKeyExpander && (
                      <div className="mt-3 space-y-3 pb-2 pt-1 text-xs">
                        <div className="grid gap-1.5">
                          <Label htmlFor="provider" className="text-[10px]">LLM Provider</Label>
                          <select
                            id="provider"
                            value={provider}
                            onChange={(e: any) => setProvider(e.target.value)}
                            className="w-full h-8 px-2 border border-slate-200 bg-white rounded-md text-xs focus:outline-none focus:border-blue-500"
                          >
                            <option value="Gemini">Gemini</option>
                            <option value="OpenAI">OpenAI</option>
                          </select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="apiKey" className="text-[10px]">API Key</Label>
                          <Input
                            id="apiKey"
                            type="password"
                            placeholder="Enter your LLM API Key"
                            value={customKey}
                            onChange={(e) => setCustomKey(e.target.value)}
                            className="h-8 text-xs bg-white border-slate-200"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => uploadMutation.mutate()}
                    disabled={uploadMutation.isPending || !fileContent}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <Spinner className="mr-2 h-4 w-4 text-white" /> Analyzing paper contents...
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="mr-2 h-4 w-4" /> Simplify Paper Now
                      </>
                    )}
                  </Button>

                </CardContent>
              </Card>

              {/* Confidence & Metrics card */}
              {selectedResult && (
                <Card className="bg-white border-slate-200/80 shadow-sm space-y-5 p-5">
                  <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                    <span className="font-display text-sm font-bold text-blue-900 flex items-center gap-1.5">
                      <Gauge className="h-4 w-4 text-blue-600" />
                      Extraction Confidence
                    </span>
                    <Badge variant="outline" className="text-[9px] py-0 border-blue-200 bg-blue-50/50 text-blue-700">
                      AI Diagnostics
                    </Badge>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-500">Summary Confidence</span>
                        <span className="text-slate-700 font-bold">{selectedResult.confidenceMeter?.summaryScore}%</span>
                      </div>
                      <Progress value={selectedResult.confidenceMeter?.summaryScore || 85} className="h-1.5 bg-slate-100 [&>div]:bg-blue-600" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-500">Extraction Quality</span>
                        <span className="text-slate-700 font-bold">{selectedResult.confidenceMeter?.extractionScore}%</span>
                      </div>
                      <Progress value={selectedResult.confidenceMeter?.extractionScore || 90} className="h-1.5 bg-slate-100 [&>div]:bg-blue-600" />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <span className="font-display text-sm font-bold text-blue-900 flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-blue-600" />
                      Analytics Metrics
                    </span>
                    
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-500">Vocabulary & Reading Difficulty</span>
                          <span className="text-slate-700 font-bold">{selectedResult.analytics?.readingDifficulty}%</span>
                        </div>
                        <Progress value={selectedResult.analytics?.readingDifficulty || 65} className="h-1.5 bg-slate-100 [&>div]:bg-amber-500" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-500">Research & Math Complexity</span>
                          <span className="text-slate-700 font-bold">{selectedResult.analytics?.researchComplexity}%</span>
                        </div>
                        <Progress value={selectedResult.analytics?.researchComplexity || 75} className="h-1.5 bg-slate-100 [&>div]:bg-purple-500" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-500">MCA Student Comprehension Rate</span>
                          <span className="text-slate-700 font-bold">{selectedResult.analytics?.studentUnderstanding}%</span>
                        </div>
                        <Progress value={selectedResult.analytics?.studentUnderstanding || 80} className="h-1.5 bg-slate-100 [&>div]:bg-emerald-500" />
                      </div>
                    </div>
                  </div>
                </Card>
              )}

            </div>

            {/* Right Col: Analyses Tabs Workspace */}
            <div className="lg:col-span-2 space-y-6">
              
              {!selectedResult ? (
                <Card className="flex flex-col items-center justify-center border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 shadow-sm min-h-[400px]">
                  <BrainCircuit className="mb-4 h-16 w-16 text-slate-300 animate-pulse" />
                  <h3 className="font-display text-lg font-bold text-blue-900 mb-1">AI Research Companion</h3>
                  <p className="max-w-md text-xs leading-relaxed">
                    Upload a research paper PDF on the left. The assistant will parse the content, extract structured methodology indices, draft a quick revision sheet, and formulate a 10-question viva preparation dashboard.
                  </p>
                </Card>
              ) : (
                <div className="space-y-6">
                  
                  {/* Analysis Tabs */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-6">
                    
                    <Accordion type="single" collapsible defaultValue="summary" className="space-y-4">
                      
                      {/* Plain English Summary */}
                      <AccordionItem value="summary" className="border border-slate-100 bg-slate-50/50 rounded-lg overflow-hidden px-4">
                        <AccordionTrigger className="text-sm font-bold text-blue-900 hover:no-underline py-3">
                          1. Plain English Summary
                        </AccordionTrigger>
                        <AccordionContent className="text-xs text-slate-600 leading-relaxed space-y-3 pt-1 pb-4">
                          {selectedResult.plainEnglishSummary.split("\n\n").map((p: string, i: number) => (
                            <p key={i}>{p}</p>
                          ))}
                        </AccordionContent>
                      </AccordionItem>

                      {/* Problem Statement */}
                      <AccordionItem value="problem" className="border border-slate-100 bg-slate-50/50 rounded-lg overflow-hidden px-4">
                        <AccordionTrigger className="text-sm font-bold text-blue-900 hover:no-underline py-3">
                          2. Problem Statement
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-1 pb-4">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block mb-1">What the researchers are solving</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.problemStatement?.solving}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block mb-1">Why it matters</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.problemStatement?.whyItMatters}</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Key Findings */}
                      <AccordionItem value="findings" className="border border-slate-100 bg-slate-50/50 rounded-lg overflow-hidden px-4">
                        <AccordionTrigger className="text-sm font-bold text-blue-900 hover:no-underline py-3">
                          3. Key Findings
                        </AccordionTrigger>
                        <AccordionContent className="pt-1 pb-4">
                          <ul className="space-y-2.5">
                            {selectedResult.keyFindings && selectedResult.keyFindings.map((finding: string, i: number) => (
                              <li key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
                                <span className="font-bold text-blue-600 shrink-0">0{i+1}.</span>
                                <span>{finding}</span>
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Methodology */}
                      <AccordionItem value="methodology" className="border border-slate-100 bg-slate-50/50 rounded-lg overflow-hidden px-4">
                        <AccordionTrigger className="text-sm font-bold text-blue-900 hover:no-underline py-3">
                          4. Research Methodology
                        </AccordionTrigger>
                        <AccordionContent className="grid gap-4 sm:grid-cols-2 pt-1 pb-4">
                          <div className="bg-white border border-slate-100 p-3 rounded-lg">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Approach & Architecture</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.methodology?.approach}</p>
                          </div>
                          <div className="bg-white border border-slate-100 p-3 rounded-lg">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Algorithms & Equations</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.methodology?.algorithms || "None discussed."}</p>
                          </div>
                          <div className="bg-white border border-slate-100 p-3 rounded-lg">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Datasets Utilized</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.methodology?.dataset || "Simulation/theoretical dataset."}</p>
                          </div>
                          <div className="bg-white border border-slate-100 p-3 rounded-lg">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Tech Stack & Frameworks</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.methodology?.tools}</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Important Keywords */}
                      <AccordionItem value="keywords" className="border border-slate-100 bg-slate-50/50 rounded-lg overflow-hidden px-4">
                        <AccordionTrigger className="text-sm font-bold text-blue-900 hover:no-underline py-3">
                          5. Important Keywords & Definitions
                        </AccordionTrigger>
                        <AccordionContent className="pt-1 pb-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {selectedResult.keywords && selectedResult.keywords.map((kw: any, i: number) => (
                              <div key={i} className="bg-white border border-slate-100 p-3 rounded-lg">
                                <span className="font-bold text-blue-700 text-xs block mb-1">{kw.word}</span>
                                <p className="text-[11px] text-slate-500 leading-normal">{kw.definition}</p>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Research Gap & Limitations */}
                      <AccordionItem value="gap" className="border border-slate-100 bg-slate-50/50 rounded-lg overflow-hidden px-4">
                        <AccordionTrigger className="text-sm font-bold text-blue-900 hover:no-underline py-3">
                          6. Research Gap & Limitations
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-1 pb-4">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-1">Missing Elements / Scope Skips</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.researchGap?.missing}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-1">Study Limitations</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.researchGap?.limitations}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-1">Open Vulnerabilities & Challenges</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.researchGap?.challenges}</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Future Scope */}
                      <AccordionItem value="scope" className="border border-slate-100 bg-slate-50/50 rounded-lg overflow-hidden px-4">
                        <AccordionTrigger className="text-sm font-bold text-blue-900 hover:no-underline py-3">
                          7. Future Scope & Extensions
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1 pb-4">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block mb-1">Recommended future improvements</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.futureScope?.improvements}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block mb-1">Student Extension/Project Opportunities</span>
                            <p className="text-xs text-slate-600 leading-relaxed">{selectedResult.futureScope?.extensions}</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                    </Accordion>

                  </div>

                  {/* Viva Prep Module Accordion */}
                  <Card className="bg-white border-slate-200/80 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="font-display text-base font-bold text-blue-900 flex items-center gap-2">
                        <Award className="h-4.5 w-4.5 text-blue-600" />
                        8. Viva Preparation Module
                      </CardTitle>
                      <CardDescription className="text-xs">
                        10 expected project viva questions compiled by the AI Mentor based on the research core metrics.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="multiple" className="space-y-2.5">
                        {selectedResult.vivaPrep && selectedResult.vivaPrep.map((item: any, i: number) => (
                          <AccordionItem key={i} value={`viva-${i}`} className="border border-slate-200 bg-slate-50/30 rounded-lg overflow-hidden px-3">
                            <AccordionTrigger className="text-xs font-semibold text-slate-700 hover:no-underline py-2.5 text-left flex justify-between gap-4">
                              <span className="flex min-w-0 items-start gap-2 pr-6">
                                <span className="font-mono text-blue-600 shrink-0">Q{i+1}.</span>
                                <span className="break-words">{item.question}</span>
                              </span>
                              <Badge className={`${getDifficultyColor(item.difficulty)} border text-[9px] px-1.5 py-0 shrink-0 font-bold`}>
                                {item.difficulty}
                              </Badge>
                            </AccordionTrigger>
                            <AccordionContent className="text-xs text-slate-500 leading-normal border-t border-slate-100 pt-3 pb-3 mt-1 pl-7">
                              <strong className="text-blue-900 block mb-1">Expected Viva Answer:</strong>
                              {item.expectedAnswer}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>

                  {/* Quick Revision Sheet */}
                  <Card className="bg-white border-slate-200/80 shadow-sm">
                    <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                      <div>
                        <CardTitle className="font-display text-base font-bold text-blue-900">
                          9. Quick Revision Sheet
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          One-page bullet-point review summary for last-minute revisions.
                        </CardDescription>
                      </div>
                      <Button
                        onClick={downloadRevisionAsTxt}
                        size="sm"
                        variant="outline"
                        className="h-8 border-blue-200 hover:bg-blue-50 text-blue-700 text-xs flex items-center gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download (.txt)
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4 text-xs">
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 italic text-slate-600 leading-relaxed">
                        {selectedResult.quickRevision?.summary}
                      </div>
                      <div className="space-y-2 pl-1">
                        <span className="font-bold text-blue-900 block text-xs">Key Study Bullet Points</span>
                        <ul className="space-y-2 list-inside list-disc text-slate-600">
                          {selectedResult.quickRevision?.bulletPoints && selectedResult.quickRevision.bulletPoints.map((pt: string, idx: number) => (
                            <li key={idx} className="leading-relaxed pl-1 text-[11px]">{pt}</li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>

                </div>
              )}

            </div>

          </div>

        </div>

        {/* Sidebar History Panel */}
        <aside className="w-full md:w-72 bg-white border-t md:border-t-0 md:border-l border-slate-200/80 p-5 shrink-0 flex flex-col">
          <div className="flex items-center gap-2 mb-4 font-display text-sm font-bold text-blue-900 border-b border-slate-100 pb-2">
            <History className="h-4.5 w-4.5 text-blue-600" />
            Analysis History
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[400px] md:max-h-none">
            {history.length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center italic">
                No research papers simplified yet.
              </div>
            ) : (
              history.map((item: any) => {
                const active = selectedMeta?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`group border rounded-lg p-3 transition-colors text-xs space-y-2 relative flex flex-col justify-between ${
                      active ? "bg-blue-50/30 border-blue-400/50" : "bg-slate-50/40 border-slate-200/80 hover:bg-slate-50"
                    }`}
                  >
                    <div className="pr-6 cursor-pointer" onClick={() => handleSelectHistory(item)}>
                      <span className="font-bold text-slate-700 block truncate" title={item.file_name}>
                        {item.file_name}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        {formatDate(item.upload_date)} · {item.num_pages} pages
                      </span>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSelectHistory(item)}
                        className="h-6 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2"
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="h-9 w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

      </div>
    </ChatLayout>
  );
}
