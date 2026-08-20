import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Returns a Vercel AI SDK-compatible model instance using Groq API.
 * Uses Groq's high-speed OpenAI-compatible REST endpoint.
 *
 * Primary Model: openai/gpt-oss-120b (Groq has retired the llama-3.x line;
 * this is the current highest-quality general-purpose chat model available
 * on the Groq API as of Aug 2026 — verified live against /v1/models).
 * Reads GROQ_API_KEY from the environment (set in .env.local).
 */
export function getAiModel(modelName: string = "openai/gpt-oss-120b") {
  // 1. Resolve Groq Key (handle direct, split P1/P2, and unexpanded ${...} strings from Render)
  let groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey || groqKey.includes("${") || groqKey.startsWith('"') || groqKey.startsWith("'")) {
    groqKey = groqKey?.replace(/['"]/g, "").trim();
    if (!groqKey || groqKey.includes("${")) {
      const p1 = process.env.GROQ_P1?.replace(/['"]/g, "").trim() || "";
      const p2 = process.env.GROQ_P2?.replace(/['"]/g, "").trim() || "";
      if (p1 && p2) {
        groqKey = `${p1}${p2}`;
      }
    }
  }

  // 2. Resolve OpenAI Key
  let openaiKey = process.env.OPENAI_API_KEY?.replace(/['"]/g, "").trim();

  // 3. Resolve Gemini Key
  let geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)?.trim();
  if (!geminiKey || geminiKey.includes("${") || geminiKey.startsWith('"') || geminiKey.startsWith("'")) {
    geminiKey = geminiKey?.replace(/['"]/g, "").trim();
    if (!geminiKey || geminiKey.includes("${")) {
      const gp1 = (process.env.GEMINI_P1 || process.env.VITE_GEMINI_P1)?.replace(/['"]/g, "").trim() || "";
      const gp2 = (process.env.GEMINI_P2 || process.env.VITE_GEMINI_P2)?.replace(/['"]/g, "").trim() || "";
      if (gp1 && gp2) {
        geminiKey = `${gp1}${gp2}`;
      }
    }
  }

  if (groqKey && !groqKey.includes("your_") && groqKey.startsWith("gsk_") && groqKey.length > 15) {
    try {
      const provider = createOpenAICompatible({
        name: "groq",
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: groqKey,
      });
      return provider(modelName);
    } catch (e) {
      console.warn("[ai-gateway] Groq provider init warning:", e);
    }
  }

  if (openaiKey && !openaiKey.includes("your_") && openaiKey.length > 15) {
    try {
      const provider = createOpenAICompatible({
        name: "openai",
        baseURL: "https://api.openai.com/v1",
        apiKey: openaiKey,
      });
      return provider("gpt-4o-mini");
    } catch (e) {
      console.warn("[ai-gateway] OpenAI provider init warning:", e);
    }
  }

  if (geminiKey && !geminiKey.includes("your_") && geminiKey.length > 15) {
    try {
      const provider = createOpenAICompatible({
        name: "gemini",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        apiKey: geminiKey,
      });
      return provider("gemini-1.5-flash");
    } catch (e) {
      console.warn("[ai-gateway] Gemini provider init warning:", e);
    }
  }

  // No valid external key — returns null to trigger instant built-in Academic AI engine
  return null;
}

/**
 * Returns a model using a user-supplied custom key.
 * Falls back to getAiModel() if no custom key is provided.
 */
export function getAiModelWithCustomKey(
  customKey?: string,
  provider?: "Groq" | "Gemini" | "OpenAI"
) {
  if (!customKey) return getAiModel();

  if (provider === "OpenAI") {
    const p = createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: customKey,
    });
    return p("gpt-4o-mini");
  }

  if (provider === "Gemini") {
    const p = createOpenAICompatible({
      name: "gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: customKey,
    });
    return p("gemini-1.5-flash");
  }

  // Default: treat as Groq API key
  const p = createOpenAICompatible({
    name: "groq-custom",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: customKey,
  });
  return p("openai/gpt-oss-120b");
}
