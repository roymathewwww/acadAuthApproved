// supabase/functions/file-converter/index.ts
// CloudConvert v2 — full PDF ↔ Office conversion bridge for AcadSphere.
// Flow: Signed URL (import) → Convert → Return CloudConvert's export URL directly

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Environment ───────────────────────────────────────────────────────────────
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY          = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLOUDCONVERT_API_KEY = Deno.env.get("CLOUDCONVERT_API_KEY")!;

// ── CORS headers — on EVERY response ─────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Conversion map: frontend ID → { inputFmt, outputFmt, outputExt } ──────────
const FORMAT_MAP: Record<string, { input: string; output: string; ext: string }> = {
  "word-to-pdf":        { input: "docx", output: "pdf",  ext: "pdf"  },
  "excel-to-pdf":       { input: "xlsx", output: "pdf",  ext: "pdf"  },
  "powerpoint-to-pdf":  { input: "pptx", output: "pdf",  ext: "pdf"  },
  "pdf-to-word":        { input: "pdf",  output: "docx", ext: "docx" },
  "pdf-to-excel":       { input: "pdf",  output: "xlsx", ext: "xlsx" },
  "pdf-to-powerpoint":  { input: "pdf",  output: "pptx", ext: "pptx" },
  "pdf-to-jpg":         { input: "pdf",  output: "jpg",  ext: "jpg"  },
  "image-to-pdf":       { input: "jpg",  output: "pdf",  ext: "pdf"  },
  "jpg-to-pdf":         { input: "jpg",  output: "pdf",  ext: "pdf"  },
  "png-to-pdf":         { input: "png",  output: "pdf",  ext: "pdf"  },
};

// ── JWT payload decoder ───────────────────────────────────────────────────────
function getUserId(token: string): string | null {
  try {
    const b64  = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(b64)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

// ── CloudConvert API helper ───────────────────────────────────────────────────
async function ccFetch(path: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.cloudconvert.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CLOUDCONVERT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? `CloudConvert ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// ── Poll job until finished or error (max 120 s) ──────────────────────────────
// Polls every 1s (was 3s) — the interval itself was adding up to 3s of pure
// waiting on top of CloudConvert's actual processing time for no reason, and
// on every single conversion.
async function waitForJob(jobId: string): Promise<any> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));   // poll every 1 s
    const { data: job } = await ccFetch(`/jobs/${jobId}`, "GET");
    console.log(`[cc] job ${jobId} status: ${job.status}`);

    if (job.status === "finished") return job;
    if (job.status === "error") {
      const errTask = (job.tasks as any[]).find((t: any) => t.status === "error");
      throw new Error(`CloudConvert error in task "${errTask?.name}": ${errTask?.message ?? "unknown"}`);
    }
  }
  throw new Error("CloudConvert job timed out after 120 s");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {

  // CORS preflight — must be first
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const token  = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const userId = getUserId(token);
    if (!userId) {
      return jsonResp({ error: "Unauthorized: invalid or missing session token." }, 401);
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const { source_path, target_format } = await req.json() as {
      source_path: string;
      target_format: string;
    };

    if (!source_path || !target_format) {
      return jsonResp({ error: "Missing required fields: source_path, target_format" }, 400);
    }

    const fmt = FORMAT_MAP[target_format];
    if (!fmt) {
      return jsonResp({
        error: `Unsupported format: "${target_format}". Valid: ${Object.keys(FORMAT_MAP).join(", ")}`,
      }, 400);
    }

    if (!source_path.startsWith(`${userId}/`)) {
      return jsonResp({ error: "Forbidden: file path does not belong to your account." }, 403);
    }

    // ── 3. Generate a short-lived signed URL for CloudConvert to import ────────
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: signedSrc, error: srcErr } = await admin.storage
      .from("conversions")
      .createSignedUrl(source_path, 300);   // 5-min URL for import

    if (srcErr || !signedSrc) {
      throw new Error(`Could not create source signed URL: ${srcErr?.message}`);
    }

    const fileName = source_path.split("/").pop() ?? `file.${fmt.input}`;
    console.log(`[cc] user=${userId} | file="${fileName}" | ${fmt.input} → ${fmt.output}`);

    // ── 4. Create CloudConvert job with 3 tasks ───────────────────────────────
    //   import/url → convert → export/url
    const { data: job } = await ccFetch("/jobs", "POST", {
      tasks: {
        "import-1": {
          operation: "import/url",
          url: signedSrc.signedUrl,
          filename: fileName,
        },
        "task-1": {
          operation: "convert",
          input: "import-1",
          input_format: fmt.input,
          output_format: fmt.output,
          // Quality settings for image conversions
          ...(fmt.output === "jpg" ? { quality: 90 } : {}),
        },
        "export-1": {
          operation: "export/url",
          input: "task-1",
          inline: false,
          archive_multiple_files: false,
        },
      },
    });

    console.log(`[cc] job created: ${job.id}`);

    // ── 5. Poll until finished ────────────────────────────────────────────────
    const finishedJob = await waitForJob(job.id);

    // ── 6. Grab exported file URL from export task ────────────────────────────
    const exportTask = (finishedJob.tasks as any[]).find(
      (t: any) => t.name === "export-1" && t.status === "finished"
    );
    if (!exportTask?.result?.files?.[0]?.url) {
      throw new Error("CloudConvert: export task missing result file URL");
    }

    const exportUrl = exportTask.result.files[0].url as string;
    console.log(`[cc] export URL ready: ${exportUrl}`);

    // ── 7. Hand the CloudConvert export URL straight back ─────────────────────
    // Previously this downloaded the full converted file into the function's
    // memory and re-uploaded it to Supabase Storage before responding — a
    // full extra file transfer round trip on every single conversion, adding
    // real, avoidable latency (worse the larger the file). CloudConvert's own
    // export URLs are already directly downloadable and valid for 24h, well
    // past the 1h window the Supabase-hosted copy offered, so there's no
    // reliability tradeoff in skipping that step.
    const baseName = fileName.replace(/\.[^.]+$/, "");

    console.log(`[cc] ✅ DONE → ${baseName}_converted.${fmt.ext}`);

    return jsonResp({
      success:    true,
      signed_url: exportUrl,
      file_name:  `${baseName}_converted.${fmt.ext}`,
    }, 200);

  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[file-converter] ❌ ERROR:", msg);
    return jsonResp({ error: msg }, 400);
  }
});
