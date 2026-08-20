import { createFileRoute } from "@tanstack/react-router";

/**
 * Diagnostic endpoint — reports which AI provider key(s) are visible to the
 * server at runtime and whether Groq accepts the resolved key, WITHOUT ever
 * exposing the secret itself (only presence, length and a masked prefix).
 *
 * Hit this on the deployed Render URL to check for env var problems, e.g.:
 *   https://acadauthapproved.onrender.com/api/ai-status
 *
 * Remove this route once the AI Assistant is confirmed working again.
 */

function mask(v: string | undefined) {
  if (!v) return { set: false, length: 0, preview: null as string | null };
  const cleaned = v.replace(/['"]/g, "").trim();
  return {
    set: true,
    length: cleaned.length,
    preview: cleaned.length > 8 ? `${cleaned.slice(0, 4)}...${cleaned.slice(-4)}` : "(too short)",
    looksUnexpanded: cleaned.includes("${"),
  };
}

async function checkGroqKey(key: string) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { valid: true, status: res.status };
    const body = await res.text().catch(() => "");
    return { valid: false, status: res.status, body: body.slice(0, 300) };
  } catch (e: any) {
    return { valid: false, error: String(e?.message || e) };
  }
}

export const Route = createFileRoute("/api/ai-status")({
  server: {
    handlers: {
      GET: async () => {
        const rawGroq = process.env.GROQ_API_KEY;
        const p1 = process.env.GROQ_P1;
        const p2 = process.env.GROQ_P2;

        let resolvedGroqKey = rawGroq?.replace(/['"]/g, "").trim();
        if (!resolvedGroqKey || resolvedGroqKey.includes("${")) {
          const cp1 = p1?.replace(/['"]/g, "").trim() || "";
          const cp2 = p2?.replace(/['"]/g, "").trim() || "";
          if (cp1 && cp2) resolvedGroqKey = `${cp1}${cp2}`;
        }

        const passesFormatCheck =
          !!resolvedGroqKey &&
          !resolvedGroqKey.includes("your_") &&
          resolvedGroqKey.startsWith("gsk_") &&
          resolvedGroqKey.length > 15;

        const liveCheck = passesFormatCheck
          ? await checkGroqKey(resolvedGroqKey!)
          : { valid: false, reason: "key missing or failed format check, skipped live call" };

        return new Response(
          JSON.stringify(
            {
              env: {
                GROQ_API_KEY: mask(rawGroq),
                GROQ_P1: mask(p1),
                GROQ_P2: mask(p2),
                OPENAI_API_KEY: mask(process.env.OPENAI_API_KEY),
                GEMINI_API_KEY: mask(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
              },
              resolvedGroqKey: mask(resolvedGroqKey),
              passesFormatCheck,
              liveGroqCheck: liveCheck,
              verdict: liveCheck.valid
                ? "Groq key is valid — AI Assistant should be using the real model."
                : "Groq key is missing/invalid/rejected — AI Assistant is falling back to the built-in canned engine.",
            },
            null,
            2
          ),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
