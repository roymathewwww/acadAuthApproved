/**
 * AcadSphere Sync — content script
 * Runs on cue.christuniversity.in. Scrapes the rendered Attendance page
 * (not CUE's internal API — avoids CORS/token-shape guessing entirely,
 * reads exactly what a human sees) and pushes it to AcadSphere.
 *
 * Scraping is text-pattern based, not CSS-class based: production React
 * builds hash their class names, so anchoring on the actual label text
 * ("hours attended", "Overall Attendance", "Theory"/"Practical") is the
 * only approach that survives CUE re-deploying their frontend.
 */

const SYNC_URL = "https://jlyembaddiyakxuvaflq.supabase.co/functions/v1/sync-attendance";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpseWVtYmFkZGl5YWt4dXZhZmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODg3NzEsImV4cCI6MjA5Nzc2NDc3MX0.ffmK3h29al3O7PksBWXzdjEoy7TbnLOmkUSHMatq1P0";

// ── DOM text-walking helpers ────────────────────────────────────────────────
function leafTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out = [];
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.replace(/\s+/g, " ").trim();
    if (t) out.push({ text: t, el: node.parentElement, node });
  }
  return out;
}

function findAncestorContaining(startEl, predicate, maxLevels = 8) {
  let el = startEl;
  for (let i = 0; i < maxLevels && el; i++) {
    const texts = leafTextNodes(el).map((n) => n.text);
    if (predicate(texts)) return el;
    el = el.parentElement;
  }
  return null;
}

const PCT_RE = /^(\d{1,3}(?:\.\d+)?)\s*%$/;
const HOURS_ATTENDED_RE = /^(\d+)\s+of\s+(\d+)\s+hours?\s+attended$/i;
const TYPE_RE = /(Theory|Practical|Lab)/i;
const HRS_ONLY_RE = /^(\d+(?:\.\d+)?)\s*hrs?$/i;
const FRACTION_HRS_RE = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*hrs?/i;

// ── Scrape course-wise cards from the "Course Overview" tab ────────────────
function scrapeCourseWise() {
  const all = leafTextNodes(document.body);
  const anchors = all.filter((n) => HOURS_ATTENDED_RE.test(n.text));
  const results = [];
  const seen = new Set();

  for (const anchor of anchors) {
    const card = findAncestorContaining(
      anchor.el,
      (texts) => texts.some((t) => PCT_RE.test(t)) && texts.some((t) => TYPE_RE.test(t)),
      8
    );
    if (!card) continue;

    const texts = leafTextNodes(card);
    const hoursMatch = anchor.text.match(HOURS_ATTENDED_RE);
    const attended = Number(hoursMatch[1]);
    const total = Number(hoursMatch[2]);

    const pctNode = texts.find((n) => PCT_RE.test(n.text));
    const typeLineNode = texts.find((n) => TYPE_RE.test(n.text) && n.text !== anchor.text);

    if (!typeLineNode) continue;
    const typeMatch = typeLineNode.text.match(TYPE_RE);
    const type = typeMatch[1];
    // Code is whatever precedes the type keyword, minus separators.
    const code = typeLineNode.text
      .split(TYPE_RE)[0]
      .replace(/[•·|]/g, " ")
      .trim() || "N/A";

    // Course name: the first substantial, non-numeric leaf text in the card
    // that isn't the hours line, the % badge, or the code/type line.
    const nameNode = texts.find(
      (n) =>
        n.text !== anchor.text &&
        n !== pctNode &&
        n.text !== typeLineNode.text &&
        n.text.length >= 3 &&
        !/^\d+$/.test(n.text) &&
        !PCT_RE.test(n.text)
    );
    const name = nameNode ? nameNode.text : code;

    const key = `${code}-${type}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      code,
      name,
      type,
      attended,
      total,
      percentage: pctNode ? Number(pctNode.text.match(PCT_RE)[1]) : (total > 0 ? Math.round((attended / total) * 10000) / 100 : 100),
    });
  }

  return results;
}

// ── Scrape the overall Present/Absent summary cards ─────────────────────────
function scrapeOverall() {
  const all = leafTextNodes(document.body);

  function nearHrs(labelText) {
    const label = all.find((n) => n.text.toLowerCase() === labelText.toLowerCase());
    if (!label) return null;
    const card = findAncestorContaining(label.el, (texts) => texts.some((t) => HRS_ONLY_RE.test(t)), 5);
    if (!card) return null;
    const hrsNode = leafTextNodes(card).find((n) => HRS_ONLY_RE.test(n.text) && n.text !== labelText);
    return hrsNode ? Number(hrsNode.text.match(HRS_ONLY_RE)[1]) : null;
  }

  return {
    present: nearHrs("Present"),
    absent: nearHrs("Absent"),
  };
}

// ── Best-effort day-wise scrape from the "Daily Log" tab ────────────────────
const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const DATE_RE = new RegExp(`^\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\.?,?\\s*\\d{4}$`, "i");
const STATUS_RE = /^(present|absent|holiday|cancelled)$/i;

function parseDateGuess(text) {
  const d = new Date(text.replace(",", ""));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function clickTabByText(text) {
  const btn = Array.from(document.querySelectorAll("button, [role='tab'], a")).find(
    (el) => el.textContent.trim().toLowerCase() === text.toLowerCase()
  );
  if (!btn) return false;
  btn.click();
  await new Promise((r) => setTimeout(r, 900));
  return true;
}

async function scrapeDailyLog() {
  try {
    const switched = await clickTabByText("Daily Log");
    if (!switched) return [];

    const all = leafTextNodes(document.body);
    const dateNodes = all.filter((n) => DATE_RE.test(n.text));
    if (dateNodes.length === 0) return [];

    const records = [];
    for (const dn of dateNodes) {
      const date = parseDateGuess(dn.text);
      if (!date) continue;
      const container = findAncestorContaining(
        dn.el,
        (texts) => texts.some((t) => STATUS_RE.test(t)),
        6
      );
      if (!container) continue;
      const texts = leafTextNodes(container);
      const statusNode = texts.find((n) => STATUS_RE.test(n.text));
      const subjectNode = texts.find(
        (n) => TYPE_RE.test(n.text) === false && n.text !== dn.text && n.text !== statusNode?.text && n.text.length >= 3 && !/^\d+$/.test(n.text)
      );
      if (!statusNode) continue;
      records.push({
        date,
        status: statusNode.text.toLowerCase(),
        subjectCode: subjectNode ? subjectNode.text.slice(0, 40) : "UNKNOWN",
        subjectName: subjectNode ? subjectNode.text : undefined,
      });
    }

    await clickTabByText("Course Overview"); // restore original view
    return records;
  } catch (e) {
    console.warn("[AcadSphere] Daily log scrape skipped:", e);
    return [];
  }
}

// ── Sync orchestration ───────────────────────────────────────────────────────
async function runSync(setStatus) {
  const { acadsphere_token: token } = await chrome.storage.local.get("acadsphere_token");
  if (!token) {
    setStatus("error", "No sync token saved. Open the extension popup and paste your AcadSphere token first.");
    return { ok: false };
  }

  setStatus("working", "Scraping course-wise attendance…");
  const courseWise = scrapeCourseWise();
  if (courseWise.length === 0) {
    setStatus("error", "Couldn't find any course cards on this page. Make sure you're on the Attendance → Course Overview tab.");
    return { ok: false };
  }

  setStatus("working", `Found ${courseWise.length} subjects. Checking Daily Log…`);
  const daily = await scrapeDailyLog();

  setStatus("working", `Syncing ${courseWise.length} subjects${daily.length ? ` + ${daily.length} day-wise records` : ""}…`);

  try {
    const res = await fetch(SYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ token, course_wise: courseWise, daily }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setStatus("error", json.error || `Sync failed (HTTP ${res.status})`);
      return { ok: false };
    }
    setStatus("success", json.message || "Synced!");
    return { ok: true, ...json };
  } catch (e) {
    setStatus("error", `Network error: ${e.message}`);
    return { ok: false };
  }
}

// ── On-page floating widget ──────────────────────────────────────────────────
function ensureWidget() {
  let el = document.getElementById("__acadsphere_widget__");
  if (el) return el;
  el = document.createElement("div");
  el.id = "__acadsphere_widget__";
  el.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#17151a;color:#fff;border-radius:14px;padding:14px 18px;font-family:system-ui,sans-serif;font-size:12.5px;font-weight:600;box-shadow:0 10px 40px rgba(0,0,0,0.35);min-width:260px;line-height:1.5;border:1px solid rgba(255,255,255,0.12)";
  document.body.appendChild(el);
  return el;
}

function widgetStatus(kind, message) {
  const el = ensureWidget();
  const icon = kind === "working" ? "🔄" : kind === "success" ? "✅" : kind === "error" ? "❌" : "🎓";
  el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px"><span>${icon}</span><strong>AcadSphere Sync</strong></div><span style="opacity:0.75;font-weight:400">${message}</span>` +
    `<div style="margin-top:8px"><button id="__acadsphere_sync_btn__" style="background:#C81E3A;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer">Sync Now</button> <button id="__acadsphere_dismiss_btn__" style="background:transparent;color:rgba(255,255,255,0.6);border:none;font-size:11px;cursor:pointer;margin-left:6px">Dismiss</button></div>`;
  document.getElementById("__acadsphere_sync_btn__")?.addEventListener("click", () => runSync(widgetStatus));
  document.getElementById("__acadsphere_dismiss_btn__")?.addEventListener("click", () => el.remove());
}

// ── Init: show widget on the attendance page, auto-sync once if paired ──────
if (location.pathname.includes("/attendence") || location.pathname.includes("/attendance")) {
  widgetStatus("idle", "Ready. Click Sync Now to pull your attendance into AcadSphere.");
  chrome.storage.local.get("acadsphere_token").then(({ acadsphere_token }) => {
    if (acadsphere_token) runSync(widgetStatus);
  });
}

// ── Respond to manual "Sync Now" trigger from the popup ─────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ACADSPHERE_SYNC_NOW") {
    runSync(widgetStatus).then((result) => sendResponse(result));
    return true; // keep the message channel open for the async response
  }
});
