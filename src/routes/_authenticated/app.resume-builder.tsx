import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { tailorResume, getTailoredResumePdf } from "@/lib/resume.functions";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Wand2,
  Download,
  CheckCircle2,
  Sparkles,
  User,
  Briefcase,
  Code2,
  FileDown,
  AlertTriangle,
  X,
  ChevronRight,
  FolderGit2,
  GraduationCap,
  Award,
} from "lucide-react";

// ─── Route ────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/_authenticated/app/resume-builder")({
  component: ResumeTailorerPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface HeaderInfo {
  fullName: string;
  subTitle?: string;
  contact: string;
  links: string;
}

interface ExperienceEntry {
  role: string;
  company: string;
  location?: string;
  period: string;
  bullets: string[];
}

interface ProjectEntry {
  name: string;
  tech: string;
  period?: string;
  bullets: string[];
}

interface EducationEntry {
  degree: string;
  institution: string;
  period: string;
  details?: string;
}

export interface TailoredResume {
  customFilename: string;
  header: HeaderInfo;
  summary: string;
  skills: Record<string, string>;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  certifications: string[];
}

// ─── CDN script loader (idempotent) ──────────────────────────────────────────
function loadScript(src: string, globalCheck: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any)[globalCheck]) return resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

// ─── PDF Text extraction via pdfjs CDN ───────────────────────────────────────
const PDFJS_VERSION = "4.4.168";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjs = await import(/* @vite-ignore */ PDFJS_CDN);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const textChunks: string[] = [];
  const links = new Set<string>();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    textChunks.push(pageText);

    // pdf.js text extraction only returns visible text, not hyperlink
    // targets — a resume with "LinkedIn"/"GitHub" as clickable display text
    // loses the actual URL entirely unless we also read link annotations.
    try {
      const annotations = await page.getAnnotations();
      for (const a of annotations) {
        if (a?.subtype === "Link" && typeof a.url === "string" && a.url) {
          links.add(a.url);
        }
      }
    } catch {
      // annotations are a best-effort enhancement; ignore failures
    }
  }
  let result = textChunks.join("\n\n").trim();
  if (links.size > 0) {
    result += `\n\n[Detected hyperlinks in original document: ${Array.from(links).join(", ")}]`;
  }
  return result;
}

// ─── DOCX / DOC Text extraction via Mammoth CDN ─────────────────────────────
const MAMMOTH_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";

async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    await loadScript(MAMMOTH_CDN, "mammoth");
    const mammoth = (window as any).mammoth;
    if (mammoth) {
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (result?.value && result.value.trim().length > 20) {
        let text = result.value.trim();

        // extractRawText() drops hyperlinks (a resume's "LinkedIn"/"GitHub"
        // display text loses its real URL) — convertToHtml() keeps them as
        // real <a href> tags, so pull the URLs from that pass separately.
        try {
          const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
          const hrefs = new Set<string>();
          const re = /href="([^"]+)"/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(htmlResult?.value || "")) !== null) {
            if (m[1] && !m[1].startsWith("#")) hrefs.add(m[1]);
          }
          if (hrefs.size > 0) {
            text += `\n\n[Detected hyperlinks in original document: ${Array.from(hrefs).join(", ")}]`;
          }
        } catch {
          // best-effort; the plain text extraction above already succeeded
        }

        return text;
      }
    }
  } catch (e) {
    console.warn("Mammoth extraction warning, using binary text fallback", e);
  }

  // Fallback for DOC / raw text files
  const decoder = new TextDecoder("utf-8");
  const raw = decoder.decode(arrayBuffer);
  const clean = raw.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ");
  return clean.trim();
}

// Tailoring runs server-side via the `tailorResume` server function
// (src/lib/resume.functions.ts), which uses the same AI gateway already
// validated for the AI Assistant. This avoids shipping any AI provider key
// to the browser and avoids Vite's build-time-only VITE_* env var pitfall
// that broke this feature on Render (VITE_GEMINI_API_KEY is only baked in
// at `npm run build` time, and Render's dashboard env vars aren't passed
// into the Docker build stage, so it always resolved to `undefined`).

// ─── Main Page ────────────────────────────────────────────────────────────────
function ResumeTailorerPage() {
  const tailorFn = useServerFn(tailorResume);
  const renderPdfFn = useServerFn(getTailoredResumePdf);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailoredResume, setTailoredResume] = useState<TailoredResume | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isPdf = ext === "pdf" || file.type === "application/pdf";
    const isDoc =
      ext === "docx" ||
      ext === "doc" ||
      file.type.includes("word") ||
      file.type.includes("document");

    if (!isPdf && !isDoc) {
      toast.error("Only PDF, DOCX, and DOC files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10MB.");
      return;
    }
    setUploadedFile(file);
    setExtractedText("");
    setTailoredResume(null);
    setIsExtracting(true);
    try {
      let text = "";
      if (isPdf) {
        text = await extractTextFromPDF(file);
      } else {
        text = await extractTextFromDocx(file);
      }

      if (!text || text.length < 30) {
        throw new Error(
          "Could not extract readable text. The document may be image-based or empty.",
        );
      }
      setExtractedText(text);
      toast.success(
        `✓ Extracted ${text.split(" ").length.toLocaleString()} words from ${file.name}`,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to parse document.");
      setUploadedFile(null);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const clearFile = () => {
    setUploadedFile(null);
    setExtractedText("");
    setTailoredResume(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTailor = async () => {
    if (!extractedText) {
      toast.error("Please upload a PDF or Word resume first.");
      return;
    }
    if (!jobDescription.trim()) {
      toast.error("Please paste a job description.");
      return;
    }
    setIsTailoring(true);
    setTailoredResume(null);
    try {
      const result = await tailorFn({ data: { resumeText: extractedText, jobDescription } });
      setTailoredResume(result as TailoredResume);
      toast.success("🎉 Resume tailored! Ready to download 1-page ATS PDF.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "AI tailoring failed. Please try again.");
    } finally {
      setIsTailoring(false);
    }
  };

  const handleDownload = async () => {
    if (!tailoredResume) return;
    setIsDownloading(true);
    try {
      const { pdfBase64 } = await renderPdfFn({ data: { resume: tailoredResume } });
      const byteChars = atob(pdfBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = `${(tailoredResume.customFilename || "Tailored_Resume").replace(/\.pdf$/i, "")}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded: ${filename}`);
    } catch (err: any) {
      toast.error("PDF generation failed: " + (err?.message || "Please try again."));
    } finally {
      setIsDownloading(false);
    }
  };

  const canTailor =
    !!extractedText && !!jobDescription.trim() && !isTailoring && !isExtracting;

  const getFileExt = (filename: string) =>
    filename.split(".").pop()?.toLowerCase() || "";

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-background text-foreground">
        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative overflow-hidden border-b border-border bg-gradient-to-br from-surface/80 via-background to-surface/40 px-6 py-10 md:px-10"
        >
          <div className="absolute -top-32 left-1/2 -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-brand-red/8 blur-[80px]" />
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-red/20 bg-brand-red/5 px-4 py-1.5 text-xs font-semibold text-brand-red">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by Groq AI · Real Job-Description-Driven Tailoring
            </div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-gradient sm:text-5xl">
              AI Resume Tailorer
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Upload your PDF, DOCX, or DOC resume, paste the target job description, and the AI reorders and
              rewords your summary, skills, experience, and projects around what that job actually asks for —
              then hand off a clean, real-text ATS-friendly PDF via your browser's own print engine.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs font-medium text-muted-foreground">
              {[
                { n: 1, label: "Upload PDF / Word" },
                { n: 2, label: "Paste JD" },
                { n: 3, label: "AI Tailors" },
                { n: 4, label: "1-Page PDF" },
              ].map((step, idx, arr) => (
                <div key={step.n} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-red/15 text-[10px] font-bold text-brand-red">
                      {step.n}
                    </span>
                    <span>{step.label}</span>
                  </div>
                  {idx < arr.length - 1 && (
                    <ChevronRight className="h-3 w-3 opacity-40" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Main Grid */}
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── LEFT: Inputs ── */}
            <div className="space-y-5">
              {/* File Upload */}
              <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red/10">
                    <Upload className="h-4 w-4 text-brand-red" />
                  </div>
                  <div>
                    <h2 className="font-sans text-sm font-semibold">
                      Upload Your Resume
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      PDF, DOCX, or DOC format · Max 10MB
                    </p>
                  </div>
                </div>
                <div className="p-5">
                  {!uploadedFile ? (
                    <label
                      htmlFor="pdf-upload"
                      onDrop={handleDrop}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 text-center cursor-pointer transition-all duration-200 ${
                        isDragOver
                          ? "border-brand-red bg-brand-red/5 scale-[1.01]"
                          : "border-border/60 bg-surface/10 hover:border-brand-red/50 hover:bg-surface/20"
                      }`}
                    >
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/40">
                        <FileText className="h-7 w-7 text-muted-foreground/60" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        Drop your PDF or Word document here
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Supports <span className="text-foreground font-medium">.pdf, .docx, .doc</span> ·{" "}
                        <span className="text-brand-red underline underline-offset-2">
                          click to browse
                        </span>
                      </p>
                      <input
                        id="pdf-upload"
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,.pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                        onChange={handleFileInput}
                        className="hidden"
                      />
                    </label>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-xl border border-border bg-surface/30 p-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                              getFileExt(uploadedFile.name) === "pdf"
                                ? "bg-red-500/10 text-red-400"
                                : "bg-blue-500/10 text-blue-400"
                            }`}
                          >
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold truncate max-w-[180px]">
                              {uploadedFile.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase font-mono">
                              {getFileExt(uploadedFile.name)} · {(uploadedFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={clearFile}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {isExtracting && (
                        <div className="flex items-center gap-2 rounded-lg bg-brand-red/5 border border-brand-red/20 px-3 py-2.5 text-xs text-brand-red">
                          <Spinner className="h-3.5 w-3.5" />
                          Parsing document text content...
                        </div>
                      )}

                      {extractedText && !isExtracting && (
                        <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2.5 text-xs text-green-400">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>
                            Extracted{" "}
                            <strong>
                              {extractedText.split(" ").length.toLocaleString()}
                            </strong>{" "}
                            words · Ready for AI tailoring
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Job Description */}
              <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
                    <Briefcase className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-sans text-sm font-semibold">
                      Target Job Description
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Paste the full job listing · More detail = better results
                    </p>
                  </div>
                </div>
                <div className="p-5">
                  <Textarea
                    id="job-description"
                    placeholder="We are looking for a Software Engineer with experience in React, Node.js, PostgreSQL..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="min-h-[220px] resize-none bg-surface/30 font-sans text-xs leading-relaxed"
                  />
                  <p className="mt-2 text-right text-[10px] text-muted-foreground">
                    {jobDescription.split(/\s+/).filter(Boolean).length} words
                  </p>
                </div>
              </div>

              {/* API key warning */}
              {!import.meta.env.VITE_GEMINI_API_KEY && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    <strong>API key missing.</strong> Add{" "}
                    <code className="font-mono bg-amber-500/10 px-1 rounded">
                      VITE_GEMINI_API_KEY
                    </code>{" "}
                    to your <code className="font-mono bg-amber-500/10 px-1 rounded">.env</code> and
                    restart the dev server.
                  </p>
                </div>
              )}

              {/* Tailor Button */}
              <Button
                id="tailor-resume-btn"
                onClick={handleTailor}
                disabled={!canTailor}
                size="lg"
                className="w-full glow-primary rounded-xl py-6 text-sm font-bold tracking-wide"
              >
                {isTailoring ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Tailoring Resume with AI...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Tailor Resume with Gemini AI
                  </>
                )}
              </Button>
            </div>

            {/* ── RIGHT: Results ── */}
            <div className="space-y-5">
              {/* Empty state */}
              {!tailoredResume && !isTailoring && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/20 p-12 text-center text-muted-foreground min-h-[400px]">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-red/5 border border-brand-red/10">
                    <Sparkles className="h-8 w-8 text-brand-red/40" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-foreground/60">
                    Your Executive 1-Page Resume Appears Here
                  </h3>
                  <p className="mt-2 max-w-xs text-xs leading-relaxed">
                    Upload your PDF, paste a job description, and click tailor to generate an ATS-optimized, zero-overlap 1-page PDF.
                  </p>
                </div>
              )}

              {/* Loading state */}
              {isTailoring && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-brand-red/20 bg-brand-red/3 p-12 text-center min-h-[400px] gap-5">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-brand-red/20 border-t-brand-red animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-brand-red" />
                  </div>
                  <div>
                    <p className="font-display font-semibold text-foreground">
                      AI is optimizing...
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Retaining projects & links · Weaving ATS keywords · Formatting zero-overlap 1-page layout
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      "Preserving Projects",
                      "Categorizing Skills",
                      "Optimizing Bullets",
                      "Calculating Coordinates",
                    ].map((s, i) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className="text-[10px] border-brand-red/20 text-brand-red/70 animate-pulse"
                        style={{ animationDelay: `${i * 0.3}s` }}
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Success preview */}
              {tailoredResume && (
                <div className="space-y-4">
                  {/* Success banner */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/15">
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-green-400">
                          Resume Optimized for Zero-Overlap ATS!
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          File:{" "}
                          <span className="font-mono text-foreground/70 break-words">
                            {tailoredResume.customFilename || "Roy_Mathew_Resume"}.pdf
                          </span>
                        </p>
                      </div>
                    </div>
                    <Button
                      id="download-resume-btn-top"
                      onClick={handleDownload}
                      disabled={isDownloading}
                      size="sm"
                      className="shrink-0 gap-2 rounded-xl font-bold"
                    >
                      {isDownloading ? (
                        <>
                          <Spinner className="h-3.5 w-3.5" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FileDown className="h-3.5 w-3.5" />
                          Download Zero-Overlap PDF
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Preview card */}
                  <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-sm divide-y divide-border/60 overflow-hidden">
                    {/* Header / Contact */}
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-brand-red" />
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-red">
                          Header & Contact
                        </span>
                      </div>
                      <h3 className="font-display text-xl font-bold">
                        {tailoredResume.header?.fullName}
                      </h3>
                      {tailoredResume.header?.subTitle && (
                        <p className="text-xs text-brand-red/80 font-medium mt-0.5">
                          {tailoredResume.header.subTitle}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {tailoredResume.header?.contact && (
                          <span>{tailoredResume.header.contact}</span>
                        )}
                        {tailoredResume.header?.links && (
                          <span className="text-indigo-400 font-mono text-[11px]">
                            {tailoredResume.header.links}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Summary */}
                    {tailoredResume.summary && (
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <Wand2 className="h-4 w-4 text-indigo-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                            Executive Summary
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {tailoredResume.summary}
                        </p>
                      </div>
                    )}

                    {/* Skills */}
                    {tailoredResume.skills &&
                      Object.keys(tailoredResume.skills).length > 0 && (
                        <div className="p-5">
                          <div className="flex items-center gap-2 mb-3">
                            <Code2 className="h-4 w-4 text-cyan-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                              Technical Skills
                            </span>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(tailoredResume.skills).map(
                              ([category, skillsList]) => (
                                <div key={category} className="text-xs">
                                  <span className="font-bold text-foreground mr-1.5">
                                    {category}:
                                  </span>
                                  <span className="text-muted-foreground">
                                    {skillsList}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                    {/* Experience */}
                    {tailoredResume.experience?.length > 0 && (
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Briefcase className="h-4 w-4 text-amber-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                            Work Experience
                          </span>
                        </div>
                        <div className="space-y-3">
                          {tailoredResume.experience.map((exp, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-border/50 bg-surface/20 p-3 space-y-2"
                            >
                              <div className="flex justify-between items-baseline">
                                <p className="text-xs font-bold">
                                  {exp.company} {exp.role ? `— ${exp.role}` : ""}
                                </p>
                                <span className="text-[10px] text-muted-foreground">
                                  {exp.period}
                                </span>
                              </div>
                              <ul className="space-y-1">
                                {(exp.bullets || []).map((bullet, j) => (
                                  <li
                                    key={j}
                                    className="flex gap-1.5 text-[10px] text-muted-foreground leading-relaxed"
                                  >
                                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand-red/60" />
                                    {bullet}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Projects */}
                    {tailoredResume.projects?.length > 0 && (
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <FolderGit2 className="h-4 w-4 text-purple-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                            Key Projects
                          </span>
                        </div>
                        <div className="space-y-3">
                          {tailoredResume.projects.map((proj, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-border/50 bg-surface/20 p-3 space-y-2"
                            >
                              <div className="flex justify-between items-baseline">
                                <p className="text-xs font-bold">
                                  {proj.name}{" "}
                                  {proj.tech ? (
                                    <span className="font-normal text-muted-foreground">
                                      | {proj.tech}
                                    </span>
                                  ) : (
                                    ""
                                  )}
                                </p>
                                <span className="text-[10px] text-muted-foreground">
                                  {proj.period}
                                </span>
                              </div>
                              <ul className="space-y-1">
                                {(proj.bullets || []).map((bullet, j) => (
                                  <li
                                    key={j}
                                    className="flex gap-1.5 text-[10px] text-muted-foreground leading-relaxed"
                                  >
                                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-purple-400/60" />
                                    {bullet}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Education & Certifications */}
                    {((tailoredResume.education && tailoredResume.education.length > 0) ||
                      (tailoredResume.certifications &&
                        tailoredResume.certifications.length > 0)) && (
                      <div className="p-5 space-y-4">
                        {tailoredResume.education?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <GraduationCap className="h-4 w-4 text-emerald-400" />
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                                Education
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {tailoredResume.education.map((edu, i) => (
                                <div key={i} className="flex justify-between text-xs">
                                  <span className="font-medium">
                                    {edu.degree} — {edu.institution}
                                  </span>
                                  <span className="text-muted-foreground text-[10px]">
                                    {edu.period} {edu.details ? `(${edu.details})` : ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {tailoredResume.certifications?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Award className="h-4 w-4 text-amber-400" />
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                                Certifications
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {tailoredResume.certifications.join(" • ")}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Download Button Footer */}
                    <div className="p-5">
                      <Button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="w-full rounded-xl gap-2 font-bold"
                        size="lg"
                      >
                        {isDownloading ? (
                          <>
                            <Spinner className="h-4 w-4 shrink-0" />
                            Generating PDF...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 truncate">
                              Download {tailoredResume.customFilename || "Resume"}.pdf
                            </span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ChatLayout>
  );
}
