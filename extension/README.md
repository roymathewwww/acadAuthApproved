# AcadSphere Sync — CUE Attendance Extension

Pulls your live, class-wise attendance (and day-wise log, best-effort) from the
Christ University CUE portal straight into AcadSphere. Runs entirely by
reading the page you already see when logged in to CUE — no CUE password is
ever entered into or stored by the extension.

## Install (unpacked — not on the Chrome Web Store)

1. Open `chrome://extensions` (or `edge://extensions` on Edge).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this `extension/` folder.
5. The AcadSphere Sync icon appears in your toolbar.

## Connect it to your AcadSphere account

1. In AcadSphere, go to **Attendance → Connect Extension** and copy your sync
   token (looks like `asx_...`). This token identifies *you* — the extension
   never needs your AcadSphere password.
2. Click the AcadSphere Sync icon in your browser toolbar, paste the token,
   click **Save Token**.

## Sync your attendance

1. Log in to `cue.christuniversity.in` and open your **Attendance** page,
   on the **Course Overview** tab.
2. A small "AcadSphere Sync" widget appears bottom-right — click **Sync Now**
   (or use the **Sync Now** button in the toolbar popup).
3. Your course-wise attendance appears in AcadSphere within seconds. If the
   page's Daily Log tab could be read, day-wise records sync too — if it
   can't be parsed, course-wise still succeeds and day-wise is simply left
   empty for that sync.

Once a token is saved, opening the CUE Attendance page auto-triggers a sync,
so a normal visit to check your attendance on CUE keeps AcadSphere current
too.

## How it works (and why it's built this way)

The extension reads the **rendered page**, not CUE's internal API — it looks
for stable label text ("hours attended", "Theory"/"Practical", "Overall
Attendance") rather than CSS class names, which get hashed and rewritten on
every CUE frontend deploy. This is deliberately the same thing you'd read off
the screen yourself, just automated.

If CUE changes its page layout enough that scraping stops finding data, the
widget will say so explicitly (e.g. "Couldn't find any course cards") rather
than silently sending nothing or guessing — send that message along with a
fresh screenshot of the page and the scraper can be adjusted.

## Privacy

- Your CUE login credentials never touch this extension — you log in to CUE
  normally in your own browser tab.
- Only your AcadSphere sync token and the scraped attendance numbers leave
  your browser, sent directly to your own AcadSphere backend.
- The token can be regenerated any time from AcadSphere → Attendance, which
  immediately disconnects any extension using the old one.
