import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { getAiModel, getAiModelWithCustomKey } from "./ai-gateway.server";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ResumeInputSchema = z.object({
  fileName: z.string(),
  fileContent: z.string(), // Base64 encoded file data
  jobDescription: z.string(),
  custom_key: z.string().optional(),
  provider: z.enum(["Gemini", "OpenAI"]).optional(),
});

const TailorInputSchema = z.object({
  resumeText: z.string().min(1),
  jobDescription: z.string().min(1),
});

function analyzeResumeHeuristics(resumeText: string, jobDescription: string) {
  const rWords = new Set(resumeText.toLowerCase().match(/\b\w+\b/g) || []);
  const jdWords = new Set(jobDescription.toLowerCase().match(/\b\w+\b/g) || []);
  
  const skillsDb = [
    "python", "javascript", "typescript", "react", "vue", "angular", "node", "fastapi", "django", "flask",
    "sql", "nosql", "mongodb", "postgresql", "mysql", "sqlite", "docker", "kubernetes", "aws", "gcp", "azure",
    "git", "github", "ci/cd", "agile", "scrum", "machine learning", "data science", "deep learning", "nlp",
    "html", "css", "tailwind", "bootstrap", "next.js", "vite", "java", "c++", "c#", "go", "rust", "php",
    "communication", "leadership", "problem solving", "teamwork", "analytical", "project management"
  ];
  
  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];
  
  for (const skill of skillsDb) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const skillRegex = new RegExp(`\\b${escaped}\\b`, "i");
    if (skillRegex.test(jobDescription)) {
      if (skillRegex.test(resumeText)) {
        matchingSkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
      } else {
        missingSkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
      }
    }
  }
  
  const totalSkillsInJd = matchingSkills.length + missingSkills.length;
  let score = 0;
  if (totalSkillsInJd > 0) {
    score = Math.round((matchingSkills.length / totalSkillsInJd) * 100);
  } else {
    let intersectionCount = 0;
    for (const w of rWords) {
      if (jdWords.has(w)) intersectionCount++;
    }
    score = Math.round((intersectionCount / Math.max(jdWords.size, 1)) * 100);
    score = Math.min(Math.max(score, 30), 95);
  }
  
  const gapAnalysis: string[] = [];
  if (missingSkills.length > 0) {
    gapAnalysis.push(`Add keywords and experience descriptions for missing core skills: ${missingSkills.slice(0, 3).join(", ")}.`);
  }
  gapAnalysis.push("Incorporate more quantitative results and metrics (e.g., '% improvement', 'reduced latency by X%') to demonstrate impact rather than just listing responsibilities.");
  gapAnalysis.push("Optimize the resume structure to place skills in a dedicated, prominent section at the top of your resume.");
  
  // split sentences
  const sentences = resumeText.split(/[.\n-]/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 120);
    
  const rewrites: Array<{ original: string; rewrite: string; reason: string }> = [];
  if (sentences.length > 0) {
    const targetSentences = sentences.slice(0, 2);
    for (let idx = 0; idx < targetSentences.length; idx++) {
      const orig = targetSentences[idx];
      if (idx === 0 && missingSkills.length > 0) {
        const skillToAdd = missingSkills[0];
        rewrites.push({
          original: orig,
          rewrite: `Designed and optimized core modules, integrating ${skillToAdd} to enhance application performance and reduce load times by 20%.`,
          reason: `Incorporates the highly requested skill '${skillToAdd}' and adds a quantitative result to show direct business impact.`
        });
      } else {
        rewrites.push({
          original: orig,
          rewrite: `Spearheaded collaborative development efforts, utilizing industry best practices to deliver project deliverables 15% ahead of schedule.`,
          reason: "Uses stronger action verbs ('Spearheaded', 'Deliver') and highlights efficiency gains with measurable metrics."
        });
      }
    }
  } else {
    rewrites.push({
      original: "Worked on building web pages for the team.",
      rewrite: "Architected and implemented modular, responsive UI components using React and Tailwind CSS, increasing accessibility scores by 18%.",
      reason: "Showcases specific front-end tech stack elements from the job description and quantifies layout improvements."
    });
  }
  
  return {
    ats_score: score,
    compatibility_rating: score >= 80 ? "High Fit" : (score >= 60 ? "Medium Fit" : "Low Fit"),
    overall_summary: `Your resume has a matching score of ${score}% against the job description. It contains several key matching skills such as ${matchingSkills.length > 0 ? matchingSkills.slice(0, 3).join(", ") : 'general industry terms'}. However, it is missing some important skills listed in the job description: ${missingSkills.length > 0 ? missingSkills.slice(0, 3).join(", ") : "none"}. Addressing these gaps and incorporating the suggested bullet rewrites will make your profile significantly stronger for ATS scanners.`,
    matching_skills: matchingSkills,
    missing_skills: missingSkills,
    gap_analysis: gapAnalysis,
    rewrites
  };
}

export const analyzeResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResumeInputSchema.parse(input))
  .handler(async ({ data }) => {
    // 1. Write the file content locally
    const tempDir = path.join(process.cwd(), "temp_uploads");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const cleanFileName = data.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const tempFilePath = path.join(tempDir, `resume_${Date.now()}_${cleanFileName}`);
    fs.writeFileSync(tempFilePath, Buffer.from(data.fileContent, "base64"));

    let resumeText = "";
    try {
      // 2. Run the python extraction bridge
      const pythonPath = "python";
      const scriptPath = path.join(process.cwd(), "extract_text.py");
      const buffer = execFileSync(pythonPath, [scriptPath, tempFilePath]);
      resumeText = buffer.toString("utf-8");
    } catch (e) {
      console.error("Text extraction failed. Falling back to simple plain text file read.", e);
      try {
        resumeText = fs.readFileSync(tempFilePath, "utf8");
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    } finally {
      // 3. Clean up the temp file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }

    if (!resumeText || resumeText.trim().length === 0) {
      throw new Error("Could not extract text from the uploaded resume file.");
    }

    const customKey = data.custom_key?.trim();
    const systemLovableKey = process.env.LOVABLE_API_KEY;
    const systemGeminiKey = process.env.GEMINI_API_KEY;
    const systemOpenaiKey = process.env.OPENAI_API_KEY;

    const hasKeys = !!(customKey || systemLovableKey || systemGeminiKey || systemOpenaiKey);

    // Fall back to local heuristics if AI keys aren't set
    if (!hasKeys) {
      return {
        text: resumeText,
        analysis: analyzeResumeHeuristics(resumeText, data.jobDescription)
      };
    }

    // Initialize AI provider
    let model: any;
    try {
      let model: any;
      if (customKey) {
        model = getAiModelWithCustomKey(customKey, data.provider);
      } else {
        model = getAiModel();
      }

      const prompt = `
      You are an expert resume optimizer and professional recruiter.
      Analyze the user's resume text and job description provided below. 
      Calculate their alignment metrics, detect skill gaps, and provide actionable bullet point rewrites.

      Resume Content:
      ${resumeText}

      Job Description:
      ${data.jobDescription}

      Provide your response as a valid JSON object. Do not include markdown code block formatting (like \`\`\`json) or any prefix/suffix outside the JSON.
      The response must strictly follow this JSON structure:
      {
          "ats_score": <integer from 0 to 100 representing compatibility score>,
          "compatibility_rating": "<High Fit / Medium Fit / Low Fit>",
          "overall_summary": "<compelling, professional, and detailed 3-4 sentence placement review summary>",
          "matching_skills": ["<list of tech stack or soft skills in the resume that match the job description>"],
          "missing_skills": ["<list of important requirements from the job description not seen in the resume>"],
          "gap_analysis": ["<actionable checklist item 1>", "<actionable checklist item 2>"],
          "rewrites": [
              {
                  "original": "<an actual weak or generic phrase/sentence extracted or derived from the resume>",
                  "rewrite": "<the optimized ATS-compatible bullet containing high-impact action verbs and quantitative results>",
                  "reason": "<explanation of the strategy used for this rewrite>"
              }
          ]
      }
      `;

      const response = await generateText({
        model,
        prompt,
      });

      let text = response.text.trim();
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?/im, "").replace(/```$/m, "").trim();
      }

      const analysis = JSON.parse(text);
      return {
        text: resumeText,
        analysis
      };
    } catch (error) {
      console.error("AI resume compatibility analysis failed, falling back to local heuristics:", error);
      return {
        text: resumeText,
        analysis: analyzeResumeHeuristics(resumeText, data.jobDescription)
      };
    }
  });

// ─── Full resume tailoring (rewrite into a structured, ATS-optimized resume) ──
// Runs server-side so the AI provider key never reaches the browser bundle
// (it previously called Gemini directly from client code using
// import.meta.env.VITE_GEMINI_API_KEY, which both leaked the key to anyone
// opening devtools AND silently broke in production because Vite only bakes
// VITE_* vars in at build time, not from Render's runtime env).
export const tailorResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TailorInputSchema.parse(input))
  .handler(async ({ data }) => {
    const model = getAiModel();
    if (!model) {
      throw new Error("No AI provider is configured on the server. Set GROQ_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY) in the environment.");
    }

    const prompt = `You are an elite Executive Resume Strategist and ATS Specialist. You do real,
job-description-driven tailoring — not generic rephrasing. Follow this process before writing
anything:

STEP 1 — ANALYZE THE JOB DESCRIPTION FIRST.
Extract, explicitly and silently to yourself: the target job title / seniority, the 8-15 hard
skills, tools, and technologies it names or clearly implies, its domain (e.g. fintech, ML infra,
frontend-heavy, backend/data-heavy), and what it emphasizes most (e.g. scale, leadership,
specific frameworks, security, performance). If the job description is extremely short or vague
(a couple of words, e.g. just a job title), infer standard expectations for that specific title
and be conservative — do not invent employer-specific requirements that weren't stated.

STEP 2 — MATCH AGAINST THE RESUME.
Identify which of the resume's actual skills, tools, projects, and experience bullets already
overlap with what you extracted in Step 1. These are what you lead with and word using the JD's
own terminology. Anything in the resume that is NOT relevant to this JD should still be
included (never delete real experience) but de-prioritized — reordered later in each list,
described more briefly, phrased more generically.

STEP 3 — WRITE THE TAILORED CONTENT.
- The summary must explicitly reflect the JD's target role/domain in its first sentence and use
  at least 3-5 of the JD's own keywords/phrases, grounded only in things the candidate actually
  has evidence of doing.
- Reorder skills categories and the items within them so JD-relevant skills come first.
- Reorder work experience and project bullets within each entry so the most JD-relevant bullets
  come first; rewrite bullets to surface JD-matching keywords and technologies where the
  underlying fact genuinely supports it — never invent a technology, metric, or outcome that
  isn't grounded in the original resume text.
- Two tailoring runs on the SAME resume with DIFFERENT job descriptions must produce visibly
  different summaries, skill ordering, and bullet emphasis — if your output would look nearly
  identical regardless of which JD was given, you have not done Step 1 and Step 2 correctly.

CRITICAL RULES:
1. DO NOT STRIP CONTENT: Retain all high-impact technical details, metrics, frameworks, projects, live URLs, GitHub, personal portfolio link, and certifications from the original resume — reorder/de-emphasize the JD-irrelevant parts, never delete them.
2. ATS KEYWORD INTEGRATION: Seamlessly weave keywords and skills from the Job Description into the Professional Summary, Experience bullet points, and Projects without lying or degrading technical depth.
3. CONCISE IMPACT BULLETS: Keep bullet points punchy and action-oriented using strong verbs (e.g., "Architected", "Integrated", "Optimized").
4. FILE NAMING: Generate a custom, clean filename (e.g., "First_Last_Target_Role_Resume") derived from the resume's own header and the JD's target role, never a placeholder person.
5. Use ONLY facts present in the original resume — never invent a name, employer, project, credential, technology, or metric that isn't there. Tailoring means re-emphasis and rewording, not fabrication.

RESUME TEXT:
${data.resumeText}

JOB DESCRIPTION:
${data.jobDescription}

RETURN ONLY A VALID JSON OBJECT WITH THIS EXACT SCHEMA (no markdown fences, no prose outside the JSON):
{
  "customFilename": "First_Last_TargetRole_Resume",
  "header": {
    "fullName": "<from resume>",
    "subTitle": "<from resume, e.g. degree/title>",
    "contact": "<email | phone | location, from resume>",
    "links": "<portfolio | linkedin | github, from resume>"
  },
  "summary": "Tailored 2-3 sentence executive summary rich in ATS keywords, based only on real resume content.",
  "skills": { "<Category>": "<comma-separated skills>" },
  "experience": [
    { "role": "", "company": "", "location": "", "period": "", "bullets": ["", ""] }
  ],
  "projects": [
    { "name": "", "tech": "", "period": "", "bullets": ["", ""] }
  ],
  "education": [
    { "degree": "", "institution": "", "period": "", "details": "" }
  ],
  "certifications": ["", ""]
}`;

    const response = await generateText({ model, prompt });

    let text = response.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?/im, "").replace(/```$/m, "").trim();
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("[tailorResume] Model did not return valid JSON:", text.slice(0, 500));
      throw new Error("AI tailoring returned an unexpected format. Please try again.");
    }
  });
