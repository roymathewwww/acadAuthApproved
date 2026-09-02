import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileOutput, Upload, Download, RefreshCw, FileText, FileImage,
  FileSpreadsheet, Presentation, CheckCircle2, X,
  Sparkles, Zap, Clock, Shield, ArrowRight, Check
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/conversions")({
  component: ConversionsPage,
});

// A plain <a href={crossOriginUrl} download> is silently ignored by browsers
// for cross-origin URLs (Supabase/CloudConvert are a different origin from
// the app) — it just navigates/opens a new tab instead of saving the file,
// which is exactly why clicking Download wasn't actually starting a
// download. Fetching the file into a blob first and downloading from a
// blob: URL (always same-origin) makes the save happen immediately, no
// extra click or tab required.
async function triggerDownload(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

// ── Conversion type definitions ───────────────────────────────────────────────
interface ConversionType {
  id: string;
  label: string;
  description: string;
  inputExt: string[];
  outputExt: string;
  icon: React.ElementType;
  accept: string;
}

// All 8 conversions — powered by CloudConvert / iLoveAPI
const CONVERSIONS: ConversionType[] = [
  {
    id: "pdf-to-word",
    label: "PDF → Word",
    description: "Convert PDF documents to editable DOCX files",
    inputExt: [".pdf"],
    outputExt: "docx",
    icon: FileText,
    accept: ".pdf,application/pdf",
  },
  {
    id: "word-to-pdf",
    label: "Word → PDF",
    description: "Turn Word documents into polished PDFs",
    inputExt: [".doc", ".docx"],
    outputExt: "pdf",
    icon: FileText,
    accept: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    id: "pdf-to-excel",
    label: "PDF → Excel",
    description: "Extract tables from PDFs into spreadsheets",
    inputExt: [".pdf"],
    outputExt: "xlsx",
    icon: FileSpreadsheet,
    accept: ".pdf,application/pdf",
  },
  {
    id: "excel-to-pdf",
    label: "Excel → PDF",
    description: "Convert spreadsheets to shareable PDFs",
    inputExt: [".xls", ".xlsx"],
    outputExt: "pdf",
    icon: FileSpreadsheet,
    accept: ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "pdf-to-powerpoint",
    label: "PDF → PowerPoint",
    description: "Convert PDF slides into editable presentations",
    inputExt: [".pdf"],
    outputExt: "pptx",
    icon: Presentation,
    accept: ".pdf,application/pdf",
  },
  {
    id: "powerpoint-to-pdf",
    label: "PowerPoint → PDF",
    description: "Turn presentations into portable PDFs",
    inputExt: [".ppt", ".pptx"],
    outputExt: "pdf",
    icon: Presentation,
    accept: ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  {
    id: "pdf-to-jpg",
    label: "PDF → JPG",
    description: "Export each PDF page as a high-quality image",
    inputExt: [".pdf"],
    outputExt: "jpg",
    icon: FileImage,
    accept: ".pdf,application/pdf",
  },
  {
    id: "image-to-pdf",
    label: "Image → PDF",
    description: "Merge JPG/PNG images into a single PDF",
    inputExt: [".jpg", ".jpeg", ".png", ".webp"],
    outputExt: "pdf",
    icon: FileImage,
    accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp",
  },
];

// ── Conversion history item ────────────────────────────────────────────────────
interface HistoryItem {
  id: string;
  fileName: string;
  conversion: string;
  signedUrl: string;
  outputFileName: string;
  timestamp: Date;
}

// ── Main page ─────────────────────────────────────────────────────────────────
function ConversionsPage() {
  const [selectedConversion, setSelectedConversion] = useState<ConversionType>(CONVERSIONS[0]);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState<"idle" | "uploading" | "processing" | "saving" | "done">("idle");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadItem = async (item: HistoryItem) => {
    setDownloadingId(item.id);
    try {
      await triggerDownload(item.signedUrl, item.outputFileName);
    } catch (err: any) {
      toast.error("Download failed", { description: err.message });
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Drag & drop handlers ───────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [selectedConversion]);

  const handleFile = (file: File) => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!selectedConversion.inputExt.includes(ext)) {
      toast.error(`Invalid file type. Expected: ${selectedConversion.inputExt.join(", ")}`);
      return;
    }
    setDroppedFile(file);
    setProgress("idle");
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ── Conversion handler ─────────────────────────────────────────────────────
  const handleConvert = async () => {
    if (!droppedFile) return;

    setConverting(true);
    setProgress("uploading");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !session?.access_token) {
        toast.error("You must be logged in to convert files.");
        setConverting(false);
        return;
      }

      const userId = session.user.id;
      const timestamp = Date.now();
      const sourcePath = `${userId}/${timestamp}_${droppedFile.name}`;

      // Step 1: Upload source file to Supabase storage
      setProgress("uploading");
      const { createClient } = await import("@supabase/supabase-js");
      const authClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${session.access_token}` } } }
      );

      const { error: uploadError } = await authClient.storage
        .from("conversions")
        .upload(sourcePath, droppedFile, { upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // Step 2: Call edge function
      setProgress("processing");
      const { data, error: fnError } = await supabase.functions.invoke("file-converter", {
        body: { source_path: sourcePath, target_format: selectedConversion.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        let actualMsg = fnError.message;
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) actualMsg = body.error;
        } catch { /* fallback */ }
        console.error("Edge function error:", actualMsg);
        throw new Error(actualMsg);
      }
      if (!data?.success) throw new Error(data?.error || "Conversion failed");

      setProgress("saving");

      // Step 3: Record in local history
      const historyItem: HistoryItem = {
        id: `${timestamp}`,
        fileName: droppedFile.name,
        conversion: selectedConversion.label,
        signedUrl: data.signed_url,
        outputFileName: data.file_name,
        timestamp: new Date(),
      };

      setHistory((prev) => [historyItem, ...prev]);
      setProgress("done");

      toast.success("File converted successfully", {
        description: `${droppedFile.name} → ${data.file_name}`,
      });

    } catch (err: any) {
      console.error("Conversion error:", err);
      toast.error("Conversion failed", { description: err.message });
      setProgress("idle");
    } finally {
      setConverting(false);
    }
  };

  const resetState = () => {
    setDroppedFile(null);
    setProgress("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const progressLabel = {
    idle: "",
    uploading: "Uploading file…",
    processing: "Processing conversion…",
    saving: "Generating download link…",
    done: "Complete",
  }[progress];

  const progressPercent = {
    idle: 0,
    uploading: 25,
    processing: 65,
    saving: 90,
    done: 100,
  }[progress];

  return (
    <ChatLayout activeThreadId={null}>
      <div className="flex flex-col h-full overflow-y-auto bg-background text-foreground">

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <header className="border-b border-border/80 bg-card/60 backdrop-blur-md px-4 py-5 sm:px-6 sm:py-6 md:px-10 shrink-0">
          <div className="max-w-4xl flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl border border-border/80 bg-muted/60 flex items-center justify-center shrink-0 shadow-xs">
                <FileOutput className="h-4.5 w-4.5 text-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold tracking-tight text-foreground leading-none">File Converter</h1>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50">
                    Engine v2
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Academic document transformation & formatting utility
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              Convert PDFs, Word documents, spreadsheets, presentations, and images with full structural fidelity.
            </p>
          </div>
        </header>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <main className="flex-1 p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto w-full">

          {/* ── Left column: Converter UI ─────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Step 1: Format Selector */}
            <Card className="border-border/80 bg-card/70 shadow-xs rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/60">
                <div className="flex flex-wrap items-center justify-between gap-y-1">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg border border-border bg-muted flex items-center justify-center text-foreground">
                      <span className="text-[10px] font-mono font-bold">1</span>
                    </div>
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Select Target Format
                    </CardTitle>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Selected: <strong className="text-foreground">{selectedConversion.label}</strong>
                  </span>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-3">
                {/* Conversion type grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CONVERSIONS.map((conv) => {
                    const isSelected = selectedConversion.id === conv.id;
                    const Icon = conv.icon;
                    return (
                      <motion.button
                        key={conv.id}
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setSelectedConversion(conv);
                          setDroppedFile(null);
                          setProgress("idle");
                        }}
                        className={`
                          group relative flex flex-col items-center gap-2 p-3 rounded-xl border text-center
                          transition-colors duration-150 cursor-pointer
                          ${isSelected
                            ? "border-brand-red bg-brand-red/10 text-foreground shadow-sm shadow-brand-red/20"
                            : "border-border/60 bg-muted/20 hover:border-brand-red/40 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                          }
                        `}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="conversionSelectedRing"
                            className="absolute inset-0 rounded-xl ring-2 ring-brand-red pointer-events-none"
                            transition={{ type: "spring", stiffness: 500, damping: 32 }}
                          />
                        )}
                        <div className={`
                          h-8 w-8 rounded-lg flex items-center justify-center transition-colors
                          ${isSelected
                            ? "bg-brand-red text-brand-red-foreground"
                            : "bg-muted border border-border/80 text-foreground group-hover:border-brand-red/40"
                          }
                        `}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-[11px] font-semibold leading-tight">
                          {conv.label}
                        </span>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5">
                            <Check className="h-3 w-3 text-brand-red" />
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span>{selectedConversion.description}</span>
                  <span className="font-mono text-[10px] text-foreground font-medium shrink-0">
                    {selectedConversion.inputExt.join(", ")} → .{selectedConversion.outputExt}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Drop Zone */}
            <Card className="border-border/80 bg-card/70 shadow-xs rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg border border-border bg-muted flex items-center justify-center text-foreground">
                    <span className="text-[10px] font-mono font-bold">2</span>
                  </div>
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Upload Document
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="pt-4">
                {!droppedFile ? (
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative flex flex-col items-center justify-center gap-3
                      rounded-2xl border-2 border-dashed p-8 md:p-10 cursor-pointer
                      transition-all duration-200
                      ${isDragging
                        ? "border-foreground bg-accent/50 scale-[1.005]"
                        : "border-border/70 bg-muted/20 hover:border-foreground/40 hover:bg-muted/40"
                      }
                    `}
                  >
                    <div className="h-12 w-12 rounded-2xl border border-border/80 bg-card flex items-center justify-center text-foreground shadow-xs">
                      <Upload className="h-6 w-6 text-foreground" />
                    </div>

                    <div className="text-center space-y-1">
                      <p className="text-xs font-semibold text-foreground">
                        {isDragging ? "Drop your file to upload" : "Drag and drop file here, or click to browse"}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        Accepts {selectedConversion.inputExt.join(", ")} · Max 50 MB
                      </p>
                    </div>
                  </div>
                ) : (
                  /* File selected state */
                  <div className="flex items-center gap-3.5 p-3.5 rounded-xl border border-border/80 bg-muted/30">
                    <div className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center text-foreground shadow-xs shrink-0">
                      <selectedConversion.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{droppedFile.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        {(droppedFile.size / 1024 / 1024).toFixed(2)} MB · Ready for conversion
                      </p>
                    </div>
                    <button
                      onClick={resetState}
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={selectedConversion.accept}
                  onChange={onFileInputChange}
                  className="hidden"
                />
              </CardContent>
            </Card>

            {/* Step 3: Convert + Progress */}
            <Card className="border-border/80 bg-card/70 shadow-xs rounded-2xl overflow-hidden">
              <CardContent className="pt-4 pb-4 space-y-4">
                {/* Progress bar */}
                <AnimatePresence>
                  {converting && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/60 overflow-hidden"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-foreground">{progressLabel}</span>
                        <span className="font-mono text-muted-foreground">{progressPercent}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-brand-red rounded-full"
                          animate={{ width: `${progressPercent}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Success result */}
                <AnimatePresence>
                  {progress === "done" && history.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 400, damping: 28 }}
                      className="flex items-center gap-3 p-3.5 rounded-xl bg-muted/40 border border-border"
                    >
                      <motion.div
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.1 }}
                        className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">File converted successfully</p>
                        <p className="text-[10px] font-mono text-muted-foreground truncate">{history[0].outputFileName}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => downloadItem(history[0])}
                        disabled={downloadingId === history[0].id}
                        className="h-8 text-xs px-3 bg-brand-red text-brand-red-foreground hover:opacity-90 gap-1.5"
                      >
                        {downloadingId === history[0].id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Download
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action button */}
                <Button
                  onClick={handleConvert}
                  disabled={!droppedFile || converting}
                  className="w-full h-11 text-xs font-semibold gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 rounded-xl shadow-xs transition-all active:scale-98"
                >
                  {converting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                      <span className="truncate">{progressLabel}</span>
                    </>
                  ) : (
                    <>
                      <FileOutput className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        Convert {droppedFile ? `"${droppedFile.name}"` : "Document"}
                      </span>
                    </>
                  )}
                </Button>

                {progress !== "done" && (
                  <p className="text-[10px] text-center text-muted-foreground">
                    Direct conversion engine · Secure temporary download link
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right column: Info + History ─────────────────────────── */}
          <div className="space-y-5">

            {/* Supported formats list */}
            <Card className="border-border/80 bg-card/70 shadow-xs rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/60">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-foreground" />
                  Format Registry
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-1.5">
                {CONVERSIONS.map((conv) => {
                  const Icon = conv.icon;
                  return (
                    <motion.div
                      key={conv.id}
                      whileHover={{ x: 3 }}
                      onClick={() => {
                        setSelectedConversion(conv);
                        setDroppedFile(null);
                        setProgress("idle");
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg border transition-colors cursor-pointer ${
                        selectedConversion.id === conv.id
                          ? "bg-brand-red/10 border-brand-red/40"
                          : "border-transparent hover:bg-muted/40 hover:border-border/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-6 w-6 rounded-md border border-border/80 bg-muted/60 flex items-center justify-center text-foreground">
                          <Icon className="h-3 w-3" />
                        </div>
                        <span className="text-xs font-medium text-foreground">{conv.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        .{conv.outputExt}
                      </span>
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Session history */}
            {history.length > 0 && (
              <Card className="border-border/80 bg-card/70 shadow-xs rounded-2xl overflow-hidden">
                <CardHeader className="pb-3 border-b border-border/60">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-foreground" />
                      Session History
                    </CardTitle>
                    <span className="text-[10px] font-mono text-muted-foreground">24h expiry</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-3 space-y-2">
                  <AnimatePresence initial={false}>
                    {history.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.2 }}
                        whileHover={{ scale: 1.01 }}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/30 border border-border/60 hover:border-brand-red/30 transition-colors"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{item.outputFileName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.conversion}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadItem(item)}
                          disabled={downloadingId === item.id}
                          className="h-9 w-9 p-0 rounded-lg border-border/70 hover:bg-muted shrink-0"
                        >
                          {downloadingId === item.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </CardContent>
              </Card>
            )}

            {/* Privacy & Security */}
            <Card className="border-border/80 bg-muted/20 shadow-xs rounded-2xl overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-foreground" />
                  Privacy & Data Retention
                </p>
                <ul className="space-y-2 text-[11px] text-muted-foreground">
                  {[
                    "Files are stored temporarily in your session bucket",
                    "Automated sanitization after processing completion",
                    "Protected by Supabase Row-Level Security (RLS)",
                    "Signed download URLs expire automatically after 60 min",
                  ].map((tip) => (
                    <li key={tip} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 rounded-full bg-foreground shrink-0" />
                      <span className="leading-snug">{tip}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ChatLayout>
  );
}
