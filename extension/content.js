/**
 * AcadSphere Sync — content script
 * Runs on cue.christuniversity.in. Scrapes the rendered Attendance page
 * (not CUE's internal API — avoids CORS/token-shape guessing entirely,
 * reads exactly what a human sees) and pushes it to AcadSphere.
 *
 * Scraping is element-textContent based, not raw Text-node or CSS-class
 * based: production React builds hash their class names (so those can't be
 * targeted), and a value like "{attended} of {total} hours attended" gets
 * split into several sibling text fragments by React's interpolation — no
 * single Text node contains the full phrase, but `element.textContent`
 * always concatenates every descendant fragment regardless of how many
 * spans/interpolations it's broken into, so matching against an element's
 * full normalized text is what actually survives that.
 */

const SYNC_URL = "https://jlyembaddiyakxuvaflq.supabase.co/functions/v1/sync-attendance";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpseWVtYmFkZGl5YWt4dXZhZmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODg3NzEsImV4cCI6MjA5Nzc2NDc3MX0.ffmK3h29al3O7PksBWXzdjEoy7TbnLOmkUSHMatq1P0";

const LOG = (...args) => console.log("[AcadSphere Sync]", ...args);

// ── DOM text-walking helpers ────────────────────────────────────────────────
function normText(s) {
  return s.replace(/\s+/g, " ").trim();
}

function elementsWithText(root) {
  return Array.from(root.querySelectorAll("*"))
    .map((el) => ({ el, text: normText(el.textContent || "") }))
    .filter((x) => x.text.length > 0);
}

// Elements whose ENTIRE own text matches `regex` exactly, deduped to keep
// only the most deeply nested match (a huge ancestor whose combined text
// happens to equal the pattern — rare given ^...$ anchoring, but be safe).
function findExactMatches(root, regex) {
  const matches = elementsWithText(root).filter((x) => regex.test(x.text));
  return matches.filter((m) => !matches.some((other) => other !== m && m.el.contains(other.el)));
}

// True DOM leaves: elements with no child elements (only text/inline
// interpolation fragments inside) — used for course-name extraction, since
// there's no fixed keyword to anchor a course title on.
function leafElements(root) {
  return elementsWithText(root).filter((x) => x.el.children.length === 0);
}

// Walk up from `startEl` until an ancestor's full text satisfies `predicate`
// (used to find the "card" boundary around a matched value).
function findAncestorContaining(startEl, predicate, maxLevels = 8) {
  let el = startEl;
  for (let i = 0; i < maxLevels && el; i++) {
    if (predicate(normText(el.textContent || ""))) return el;
    el = el.parentElement;
  }
  return null;
}

// ── Patterns ─────────────────────────────────────────────────────────────────
const PCT_RE = /^(\d{1,3}(?:\.\d+)?)\s*%$/;
const PCT_CONTAINS_RE = /\d{1,3}(?:\.\d+)?\s*%/;
const HOURS_ATTENDED_RE = /^(\d+)\s+of\s+(\d+)\s+hours?\s+attended$/i;
const TYPE_RE = /(Theory|Practical|Lab)/i;
const HRS_ONLY_RE = /^(\d+(?:\.\d+)?)\s*hrs?$/i;
const HRS_CONTAINS_RE = /\d+(?:\.\d+)?\s*hrs?/i;

// ── Scrape course-wise cards from the "Course Overview" tab ────────────────
function scrapeCourseWise() {
  const anchors = findExactMatches(document.body, HOURS_ATTENDED_RE);
  LOG(`scrapeCourseWise: found ${anchors.length} "X of Y hours attended" anchor(s)`);
  const results = [];
  const seen = new Set();

  for (const anchor of anchors) {
    const card = findAncestorContaining(
      anchor.el,
      (text) => PCT_CONTAINS_RE.test(text) && TYPE_RE.test(text),
      8
    );
    if (!card) {
      LOG("  ↳ skipped anchor (no card ancestor with % + Theory/Practical found):", anchor.text);
      continue;
    }

    const hoursMatch = anchor.text.match(HOURS_ATTENDED_RE);
    const attended = Number(hoursMatch[1]);
    const total = Number(hoursMatch[2]);

    // Percentage badge: smallest element whose whole text is just "NN.NN%".
    const pctEl = findExactMatches(card, PCT_RE)[0];

    // Code + type line: shortest element containing the type keyword (the
    // shortest one is the badge itself, not some larger wrapper around it).
    const typeCandidates = elementsWithText(card)
      .filter((x) => TYPE_RE.test(x.text) && x.text.length <= 40)
      .sort((a, b) => a.text.length - b.text.length);
    const typeLine = typeCandidates[0];
    if (!typeLine) {
      LOG("  ↳ skipped anchor (no code/type line found in card):", anchor.text);
      continue;
    }

    const type = typeLine.text.match(TYPE_RE)[1];
    const code = typeLine.text.split(TYPE_RE)[0].replace(/[•·|]/g, " ").trim() || "N/A";

    // Course name: first true DOM leaf in the card, in document order, that
    // isn't the hours line, % badge, or code/type line, and looks like a
    // real title rather than a stray number or icon glyph.
    const nameLeaf = leafElements(card).find(
      (x) =>
        x.text !== anchor.text &&
        (!pctEl || x.el !== pctEl.el) &&
        x.text !== typeLine.text &&
        x.text.length >= 3 &&
        !/^\d+$/.test(x.text) &&
        !PCT_RE.test(x.text)
    );
    const name = nameLeaf ? nameLeaf.text : code;

    const key = `${code}-${type}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      code,
      name,
      type,
      attended,
      total,
      percentage: pctEl ? Number(pctEl.text.match(PCT_RE)[1]) : (total > 0 ? Math.round((attended / total) * 10000) / 100 : 100),
    });
  }

  LOG(`scrapeCourseWise: parsed ${results.length} course card(s)`, results);
  return results;
}

// ── Scrape the overall Present/Absent summary cards ─────────────────────────
function scrapeOverall() {
  function nearHrs(labelText) {
    const labelMatches = findExactMatches(document.body, new RegExp(`^${labelText}$`, "i"));
    if (labelMatches.length === 0) return null;
    const card = findAncestorContaining(labelMatches[0].el, (text) => HRS_CONTAINS_RE.test(text), 5);
    if (!card) return null;
    const hrsMatches = findExactMatches(card, HRS_ONLY_RE);
    return hrsMatches.length > 0 ? Number(hrsMatches[0].text.match(HRS_ONLY_RE)[1]) : null;
  }

  return { present: nearHrs("Present"), absent: nearHrs("Absent") };
}

// ── Best-effort day-wise scrape from the "Daily Log" tab ────────────────────
const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const DATE_RE = new RegExp(`^\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\.?,?\\s*\\d{4}$`, "i");
const STATUS_RE = /^(present|absent|holiday|cancelled)$/i;

function parseDateGuess(text) {
  const d = new Date(text.replace(",", ""));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
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
    if (!switched) {
      LOG("scrapeDailyLog: no 'Daily Log' tab found — skipping day-wise sync");
      return [];
    }

    const dateMatches = findExactMatches(document.body, DATE_RE);
    LOG(`scrapeDailyLog: found ${dateMatches.length} date-like element(s)`);
    if (dateMatches.length === 0) {
      await clickTabByText("Course Overview");
      return [];
    }

    const records = [];
    for (const dateMatch of dateMatches) {
      const date = parseDateGuess(dateMatch.text);
      if (!date) continue;

      const container = findAncestorContaining(dateMatch.el, (text) => STATUS_RE.test(text) || /present|absent|holiday|cancelled/i.test(text), 6);
      if (!container) continue;

      const statusEl = findExactMatches(container, STATUS_RE)[0]
        || elementsWithText(container).find((x) => /present|absent|holiday|cancelled/i.test(x.text) && x.text.length <= 20);
      if (!statusEl) continue;
      const status = (statusEl.text.match(/present|absent|holiday|cancelled/i)?.[0] || "").toLowerCase();
      if (!status) continue;

      const subjectLeaf = leafElements(container).find(
        (x) => x.text !== dateMatch.text && x.text !== statusEl.text && x.text.length >= 3 && !/^\d+$/.test(x.text)
      );

      records.push({
        date,
        status,
        subjectCode: subjectLeaf ? subjectLeaf.text.slice(0, 40) : "UNKNOWN",
        subjectName: subjectLeaf ? subjectLeaf.text : undefined,
      });
    }

    await clickTabByText("Course Overview"); // restore original view
    LOG(`scrapeDailyLog: parsed ${records.length} record(s)`);
    return records;
  } catch (e) {
    console.warn("[AcadSphere Sync] Daily log scrape skipped:", e);
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
    setStatus("error", "Couldn't find any course cards on this page. Make sure you're on the Attendance → Course Overview tab. (Open DevTools console for details — look for '[AcadSphere Sync]' lines.)");
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
