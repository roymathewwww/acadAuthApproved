import fs from "node:fs";
import type { Browser } from "puppeteer-core";

/**
 * Server-side, real-headless-Chromium PDF rendering for the tailored resume.
 *
 * Why this exists: two prior approaches both produced visibly distorted PDFs
 * (jsPDF's manual glyph positioning, then the browser's own window.print()
 * triggered client-side) — the print() approach still broke because the rest
 * of the app's on-screen layout was only made invisible (visibility:hidden),
 * not removed from layout, so it could still influence the page's effective
 * width during print and throw off wrapping. Rendering server-side with a
 * fully isolated headless browser page (nothing else in the DOM, an explicit
 * A4 page size, no ambient app layout to interfere) removes that entire
 * class of bug. The output is real text (selectable, ATS-parseable), laid
 * out by an actual browser engine — the same kind of engine that renders
 * this content correctly everywhere else.
 */

let browserPromise: Promise<Browser> | null = null;

function findChromiumExecutable(): string | undefined {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    // Alpine/Debian system Chromium (installed via the Dockerfile)
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    // Windows (local dev convenience)
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { default: puppeteer } = await import("puppeteer-core");
      const executablePath = findChromiumExecutable();
      if (!executablePath) {
        throw new Error(
          "No Chromium/Chrome executable found on this server. Set PUPPETEER_EXECUTABLE_PATH " +
            "or install a system Chromium (see Dockerfile).",
        );
      }
      return puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    })().catch((e) => {
      browserPromise = null; // allow retry on next call instead of caching a failed launch
      throw e;
    });
  }
  return browserPromise;
}

// Chromium renders full Unicode correctly, so this is no longer needed to
// fix layout — it's kept because some ATS *parsers* (as opposed to PDF
// viewers) still mis-read ligatures/smart typography even in a well-formed,
// real-text PDF.
function sanitizeAtsText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u200B-\u200D\u2060]/g, "");
}

function escapeHtml(s: string): string {
  return sanitizeAtsText(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Turns a "roymathew.site | linkedin.com/in/roy | github.com/roy" style string
// (or a comma-separated one) into real clickable <a> tags, styled like the
// blue-underlined links in a conventional resume.
function linkifySegments(raw: string | undefined): string {
  if (!raw) return "";
  const parts = raw.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  return parts
    .map((part) => {
      const emailMatch = part.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      if (emailMatch) {
        return `<a href="mailto:${escapeHtml(part)}">${escapeHtml(part)}</a>`;
      }
      const urlLike = part.match(/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i);
      if (urlLike) {
        const href = part.startsWith("http") ? part : `https://${part}`;
        return `<a href="${escapeHtml(href)}">${escapeHtml(part)}</a>`;
      }
      // Plain label like "LinkedIn" / "GitHub" with no URL we can recover —
      // render as text; the AI is instructed to include the real URL/handle
      // whenever the source resume had one.
      return escapeHtml(part);
    })
    .join(' <span class="rp-sep">|</span> ');
}

export interface TailoredResumeForPdf {
  customFilename?: string;
  header?: { fullName?: string; subTitle?: string; contact?: string; links?: string };
  summary?: string;
  skills?: Record<string, string>;
  experience?: Array<{ role?: string; company?: string; location?: string; period?: string; bullets?: string[] }>;
  projects?: Array<{ name?: string; tech?: string; period?: string; bullets?: string[] }>;
  education?: Array<{ degree?: string; institution?: string; period?: string; details?: string }>;
  certifications?: string[];
}

function buildResumeHtml(data: TailoredResumeForPdf): string {
  const h = data.header || {};
  const rows = (arr: any[] | undefined, render: (x: any) => string) =>
    (arr || []).map(render).join("\n");

  const skillsHtml = Object.entries(data.skills || {})
    .map(
      ([cat, items]) =>
        `<p class="rp-skill"><span class="rp-skill-cat">${escapeHtml(cat)}:</span> ${escapeHtml(String(items))}</p>`,
    )
    .join("\n");

  const bulletsHtml = (bullets: string[] | undefined) =>
    bullets && bullets.length
      ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
      : "";

  const experienceHtml = rows(data.experience, (exp) => `
    <div class="rp-row">
      <div class="rp-row-head">
        <span class="rp-row-title">${escapeHtml([exp.company, exp.role].filter(Boolean).join(" \u2014 "))}</span>
        <span class="rp-row-date">${escapeHtml(exp.period || "")}</span>
      </div>
      ${bulletsHtml(exp.bullets)}
    </div>`);

  const projectsHtml = rows(data.projects, (proj) => `
    <div class="rp-row">
      <div class="rp-row-head">
        <span class="rp-row-title">${escapeHtml(proj.tech ? `${proj.name} | ${proj.tech}` : proj.name || "")}</span>
        <span class="rp-row-date">${escapeHtml(proj.period || "")}</span>
      </div>
      ${bulletsHtml(proj.bullets)}
    </div>`);

  const educationHtml = rows(data.education, (edu) => `
    <div class="rp-row">
      <div class="rp-row-head">
        <span class="rp-row-title">${escapeHtml([edu.degree, edu.institution].filter(Boolean).join(" \u2014 "))}</span>
        <span class="rp-row-date">${escapeHtml(edu.period || "")}</span>
      </div>
      ${edu.details ? `<p class="rp-details">${escapeHtml(edu.details)}</p>` : ""}
    </div>`);

  const certsHtml =
    data.certifications && data.certifications.length
      ? `<p class="rp-skill"><span class="rp-skill-cat">Certifications:</span> ${data.certifications.map(escapeHtml).join(" &bull; ")}</p>`
      : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1e293b;
    font-size: 10pt;
    line-height: 1.42;
  }
  h1 { font-size: 19pt; font-weight: 700; margin: 0 0 3pt; color: #0f172a; text-align: center; }
  .rp-contact { font-size: 9pt; color: #334155; margin: 0 0 10pt; text-align: center; }
  .rp-contact a, .rp-skill a { color: #1d4ed8; text-decoration: underline; }
  .rp-sep { color: #94a3b8; }
  h2 {
    font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
    margin: 11pt 0 4pt; padding-bottom: 2pt; border-bottom: 1pt solid #1d4ed8; color: #0f172a;
  }
  .rp-row { margin-top: 6pt; }
  .rp-row-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
  .rp-row-title { font-weight: 700; font-size: 10pt; color: #0f172a; }
  .rp-row-date { font-weight: 400; font-style: italic; font-size: 9pt; color: #475569; white-space: nowrap; }
  ul { margin: 3pt 0 0; padding-left: 13pt; }
  li { margin: 1.5pt 0; }
  p { margin: 3pt 0; }
  .rp-skill { margin: 2.5pt 0; }
  .rp-skill-cat { font-weight: 700; }
  .rp-details { font-size: 9pt; font-style: italic; color: #475569; margin: 1pt 0 0; }
</style>
</head>
<body>
  <h1>${escapeHtml(h.fullName || "Candidate Name")}</h1>
  <p class="rp-contact">${linkifySegments(h.contact)}${h.contact && h.links ? ' <span class="rp-sep">|</span> ' : ""}${linkifySegments(h.links)}</p>

  ${data.summary ? `<h2>Professional Summary</h2><p>${escapeHtml(data.summary)}</p>` : ""}
  ${skillsHtml ? `<h2>Technical Skills</h2>${skillsHtml}` : ""}
  ${experienceHtml ? `<h2>Work Experience</h2>${experienceHtml}` : ""}
  ${projectsHtml ? `<h2>Key Projects</h2>${projectsHtml}` : ""}
  ${educationHtml || certsHtml ? `<h2>Education &amp; Certifications</h2>${educationHtml}${certsHtml}` : ""}
</body>
</html>`;
}

export async function renderResumePdf(data: TailoredResumeForPdf): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const html = buildResumeHtml(data);
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: false,
      margin: { top: "14mm", bottom: "14mm", left: "15mm", right: "15mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
