import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { tailorResume } from "@/lib/resume.functions";
import { ChatLayout } from "@/components/chat/ChatLayout";
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
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    textChunks.push(pageText);
  }
  return textChunks.join("\n\n").trim();
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
        return result.value.trim();
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

// ─── ATS-safe text sanitizer ──────────────────────────────────────────────────
// Text extracted from a real-world PDF/DOCX (via pdf.js / mammoth) and then
// rewritten by an LLM frequently carries characters standard PDF fonts and
// ATS parsers both handle badly: ligatures ("ﬁ", "ﬂ") merged into a single
// glyph the base-14 Helvetica font has no width metric for (which silently
// breaks jsPDF's line-wrap math and is exactly what produced the distorted,
// overflowing PDF), smart quotes/dashes, non-breaking spaces, bullets, etc.
// Normalizing everything down to plain ASCII fixes the layout bug AND is
// genuinely more ATS-friendly, since many parsers mis-read those characters.
function sanitizeAtsText(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .normalize("NFKD")
    // Decompose common ligatures pdf.js sometimes extracts as one glyph (U+FB00-FB04)
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    // Strip combining diacritical marks left behind by NFKD (e.g. e + acute -> e)
    .replace(/[\u0300-\u036f]/g, "")
    // Normalize every Unicode space variant (NBSP, thin space, etc.) to a plain ASCII space
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, " ")
    // Smart quotes -> straight ASCII quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // En/em dash -> hyphen, ellipsis -> three dots
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    // Other bullet glyph variants -> the one bullet char we actually use (U+2022)
    .replace(/[\u25CF\u25AA\u2023\u2043]/g, "\u2022")
    // Drop zero-width/invisible characters entirely
    .replace(/[\u200B-\u200D\u2060]/g, "")
    // Anything still outside printable ASCII (keep the bullet char we use) -> drop
    .replace(/[^\x20-\x7E\u2022\n]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

// Recursively sanitize every string field of the tailored resume payload
function sanitizeTailoredResume(data: TailoredResume): TailoredResume {
  const clean = (v: any): any => {
    if (typeof v === "string") return sanitizeAtsText(v);
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object") {
      const out: any = {};
      for (const k of Object.keys(v)) out[k] = clean(v[k]);
      return out;
    }
    return v;
  };
  return clean(data) as TailoredResume;
}

// ─── Stateful PDF Layout Engine (Zero-Overlap ATS Engine) ────────────────────
const JSPDF_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

class PDFLayoutEngine {
  doc: any;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  contentWidth: number;
  y: number;

  marginBottom: number;

  constructor(jsPDF: any) {
    this.doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    this.pageWidth = 210;
    this.pageHeight = 297;
    this.marginX = 12; // 12mm standard ATS margins
    this.marginBottom = 14;
    this.contentWidth = this.pageWidth - this.marginX * 2; // 186mm
    this.y = 12; // Current vertical position tracker
  }

  // Set Font and Styles easily
  setFont(bold = false, italic = false, size = 9, color = [30, 41, 59]) {
    let style = "normal";
    if (bold && italic) style = "bolditalic";
    else if (bold) style = "bold";
    else if (italic) style = "italic";

    this.doc.setFont("helvetica", style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color[0], color[1], color[2]);
  }

  // Self-measured, self-validated word wrap. Deliberately does NOT rely on
  // jsPDF's own splitTextToSize() — real-world resume text (extracted from a
  // PDF/DOCX and rewritten by an LLM) can contain characters the base-14
  // Helvetica font's metric table has no entry for, which silently threw off
  // splitTextToSize's width math and produced the overflowing, "stretched"
  // looking PDF. Measuring every candidate line directly with getTextWidth()
  // (the same primitive used to actually render it) guarantees a line never
  // exceeds maxWidth, regardless of any such gap in the font metrics.
  wrapText(text: string, maxWidth: number): string[] {
    const safeWidth = Math.max(maxWidth, 15) * 0.97; // small safety margin
    const words = (text || "").split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const lines: string[] = [];
    let current = "";

    const breakLongWord = (word: string) => {
      let chunk = "";
      for (const ch of word) {
        const test = chunk + ch;
        if (this.doc.getTextWidth(test) > safeWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = test;
        }
      }
      return chunk;
    };

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.doc.getTextWidth(candidate) <= safeWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      if (this.doc.getTextWidth(word) <= safeWidth) {
        current = word;
      } else {
        current = breakLongWord(word);
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }

  // Start a new page and reset the vertical cursor if the given amount of
  // content wouldn't fit on the remainder of the current page. Keeps the
  // "1-page" design intact for typical resumes while never silently
  // truncating content that genuinely needs a second page.
  ensureSpace(neededHeight: number) {
    if (this.y + neededHeight > this.pageHeight - this.marginBottom) {
      this.doc.addPage();
      this.y = this.marginX;
    }
  }

  // Draw Section Header with Horizontal Rule
  addSectionHeader(title: string) {
    this.ensureSpace(12);
    this.y += 3;
    this.setFont(true, false, 10, [15, 23, 42]);
    this.doc.text(title.toUpperCase(), this.marginX, this.y);

    this.y += 1.5;
    this.doc.setDrawColor(203, 213, 225);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.marginX, this.y, this.pageWidth - this.marginX, this.y);
    this.y += 4;
  }

  // Add Two-Column Header Row (Left Title, Right Date/Location) without Collision
  addHeaderRow(leftText: string, rightText: string = "", isBold = true) {
    this.setFont(isBold, false, 9.5, [15, 23, 42]);

    const rightWidth = rightText ? this.doc.getTextWidth(rightText) : 0;
    const maxLeftWidth = this.contentWidth - rightWidth - (rightText ? 4 : 0); // Leave 4mm safety gap if right text exists

    // Wrap left text if it's too long so it NEVER overlaps right text
    const splitLeft = this.wrapText(leftText, Math.max(maxLeftWidth, 50));
    this.ensureSpace(splitLeft.length * 4 + 2);

    // Print Left Text
    this.doc.text(splitLeft, this.marginX, this.y);

    // Print Right Text on first line
    if (rightText) {
      this.setFont(false, true, 9, [71, 85, 105]);
      this.doc.text(rightText, this.pageWidth - this.marginX, this.y, {
        align: "right",
      });
    }

    // Safely increment Y based on wrapped lines
    this.y += splitLeft.length * 4;
  }

  // Add Wrapped Bullet Points with Dynamic Line Height Calculation
  addBulletPoint(text: string) {
    this.setFont(false, false, 8.5, [51, 65, 85]);
    const bulletPrefix = "•  ";
    const indent = 4;
    const availableWidth = this.contentWidth - indent;

    const splitText = this.wrapText(text, availableWidth);
    this.ensureSpace(splitText.length * 3.4 + 2);

    // Print bullet symbol
    this.doc.text(bulletPrefix, this.marginX + 1, this.y);

    // Print text lines
    this.doc.text(splitText, this.marginX + indent, this.y);

    // Increment Y dynamically based on exact line count (3.4mm per line)
    this.y += splitText.length * 3.4 + 1;
  }

  // Add Inline Key-Value Pair (e.g. "Frontend: React, Tailwind")
  addInlineCategory(category: string, items: string) {
    this.setFont(true, false, 8.5, [15, 23, 42]);
    const catText = `${category}: `;
    const catWidth = this.doc.getTextWidth(catText);

    this.setFont(false, false, 8.5, [51, 65, 85]);
    const splitItems = this.wrapText(items, this.contentWidth - catWidth);
    this.ensureSpace(splitItems.length * 3.6 + 2);

    this.setFont(true, false, 8.5, [15, 23, 42]);
    this.doc.text(catText, this.marginX, this.y);

    this.setFont(false, false, 8.5, [51, 65, 85]);
    // If items wrap to multiple lines, indent secondary lines properly
    this.doc.text(splitItems, this.marginX + catWidth, this.y);
    this.y += splitItems.length * 3.6 + 1;
  }

  // Save the PDF with Clean Filename
  save(filename: string) {
    const cleanName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    this.doc.save(cleanName);
  }
}

export const generateATSResume = async (rawData: TailoredResume): Promise<void> => {
  await loadScript(JSPDF_CDN, "jspdf");
  const { jsPDF } = (window as any).jspdf;

  // Normalize every field to plain ASCII before any layout math touches it —
  // see sanitizeAtsText() above for why this matters.
  const data = sanitizeTailoredResume(rawData);

  const engine = new PDFLayoutEngine(jsPDF);

  // 1. HEADER
  engine.setFont(true, false, 18, [15, 23, 42]);
  engine.doc.text(data.header?.fullName || "Candidate Name", engine.marginX, engine.y);
  engine.y += 5;

  engine.setFont(false, false, 8.5, [71, 85, 105]);
  const contactLine = [data.header?.contact, data.header?.links]
    .filter(Boolean)
    .join("  |  ");
  const splitContact = engine.wrapText(contactLine, engine.contentWidth);
  engine.doc.text(splitContact, engine.marginX, engine.y);
  engine.y += splitContact.length * 3.8 + 2;

  // 2. PROFESSIONAL SUMMARY
  if (data.summary) {
    engine.addSectionHeader("Professional Summary");
    engine.setFont(false, false, 8.5, [51, 65, 85]);
    const splitSummary = engine.wrapText(data.summary, engine.contentWidth);
    engine.ensureSpace(splitSummary.length * 3.6 + 2);
    engine.doc.text(splitSummary, engine.marginX, engine.y);
    engine.y += splitSummary.length * 3.6 + 2;
  }

  // 3. TECHNICAL SKILLS
  if (data.skills && Object.keys(data.skills).length > 0) {
    engine.addSectionHeader("Technical Skills");
    Object.entries(data.skills).forEach(([category, skillsList]) => {
      engine.addInlineCategory(category, skillsList);
    });
    engine.y += 1;
  }

  // 4. WORK EXPERIENCE
  if (data.experience && data.experience.length > 0) {
    engine.addSectionHeader("Work Experience");
    data.experience.forEach((exp) => {
      const expTitle = `${exp.company || ""}${exp.company && exp.role ? " — " : ""}${exp.role || ""}`;
      engine.addHeaderRow(expTitle, exp.period || "");
      (exp.bullets || []).forEach((bullet) => engine.addBulletPoint(bullet));
      engine.y += 1.5;
    });
  }

  // 5. KEY PROJECTS
  if (data.projects && data.projects.length > 0) {
    engine.addSectionHeader("Key Projects");
    data.projects.forEach((proj) => {
      const projTitle = proj.tech ? `${proj.name} | ${proj.tech}` : proj.name;
      engine.addHeaderRow(projTitle, proj.period || "");
      (proj.bullets || []).forEach((bullet) => engine.addBulletPoint(bullet));
      engine.y += 1.5;
    });
  }

  // 6. EDUCATION & CERTIFICATIONS
  if (
    (data.education && data.education.length > 0) ||
    (data.certifications && data.certifications.length > 0)
  ) {
    engine.addSectionHeader("Education & Certifications");
    (data.education || []).forEach((edu) => {
      const eduText = `${edu.degree || ""}${edu.degree && edu.institution ? " — " : ""}${edu.institution || ""}`;
      engine.addHeaderRow(eduText, edu.period || "");
      if (edu.details) {
        engine.setFont(false, true, 8, [100, 116, 139]);
        const splitDetails = engine.wrapText(edu.details, engine.contentWidth);
        engine.ensureSpace(splitDetails.length * 3.5 + 1);
        engine.doc.text(splitDetails, engine.marginX, engine.y);
        engine.y += splitDetails.length * 3.5;
      }
    });

    if (data.certifications && data.certifications.length > 0) {
      if (data.education && data.education.length > 0) engine.y += 1;
      const certList = data.certifications.join(" • ");
      engine.addInlineCategory("Certifications", certList);
    }
  }

  // Save Document
  engine.save(data.customFilename || "Roy_Mathew_Tailored_Resume");
};

// ─── Main Page ────────────────────────────────────────────────────────────────
function ResumeTailorerPage() {
  const tailorFn = useServerFn(tailorResume);
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
      await generateATSResume(tailoredResume);
      toast.success(`Downloaded: ${tailoredResume.customFilename || "Resume"}.pdf`);
    } catch (err: any) {
      toast.error("PDF generation failed: " + err.message);
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
        <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-surface/80 via-background to-surface/40 px-6 py-10 md:px-10">
          <div className="absolute -top-32 left-1/2 -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/8 blur-[80px]" />
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by Gemini 3.6 Flash · PDFLayoutEngine (Zero Overlap ATS)
            </div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-gradient sm:text-5xl">
              AI Resume Tailorer
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Upload your PDF, DOCX, or DOC resume, paste the target job description, and let Gemini 3.6 Flash
              optimize your summary, skills, experience, and projects for ATS compatibility — then download a pristine, high-density 1-page PDF.
            </p>
            <div className="mt-8 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
              {[
                { n: 1, label: "Upload PDF / Word" },
                { n: 2, label: "Paste JD" },
                { n: 3, label: "AI Tailors" },
                { n: 4, label: "1-Page PDF" },
              ].map((step, idx, arr) => (
                <div key={step.n} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
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
        </div>

        {/* Main Grid */}
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── LEFT: Inputs ── */}
            <div className="space-y-5">
              {/* File Upload */}
              <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Upload className="h-4 w-4 text-primary" />
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
                          ? "border-primary bg-primary/5 scale-[1.01]"
                          : "border-border/60 bg-surface/10 hover:border-primary/50 hover:bg-surface/20"
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
                        <span className="text-primary underline underline-offset-2">
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
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {isExtracting && (
                        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5 text-xs text-primary">
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
                    Tailoring Resume with Gemini 3.6 Flash...
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
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/5 border border-primary/10">
                    <Sparkles className="h-8 w-8 text-primary/40" />
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
                <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/3 p-12 text-center min-h-[400px] gap-5">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-display font-semibold text-foreground">
                      Gemini 3.6 Flash is optimizing...
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
                        className="text-[10px] border-primary/20 text-primary/70 animate-pulse"
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
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/15">
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-400">
                          Resume Optimized for Zero-Overlap ATS!
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          File:{" "}
                          <span className="font-mono text-foreground/70">
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
                        <User className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          Header & Contact
                        </span>
                      </div>
                      <h3 className="font-display text-xl font-bold">
                        {tailoredResume.header?.fullName}
                      </h3>
                      {tailoredResume.header?.subTitle && (
                        <p className="text-xs text-primary/80 font-medium mt-0.5">
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
                                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
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
                            <Spinner className="h-4 w-4" />
                            Generating PDF...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            Download {tailoredResume.customFilename || "Resume"}.pdf
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
