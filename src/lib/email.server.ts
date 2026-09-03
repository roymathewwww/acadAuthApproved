// ─── Transactional email sender ───────────────────────────────────────────────
// Provider-agnostic and dependency-free on purpose: both supported providers
// are plain REST APIs reachable with fetch(), so this works as-is on Render
// without adding nodemailer/SMTP plumbing or a new npm dependency.
//
// Configure ONE of these in the Render environment:
//   RESEND_API_KEY  — https://resend.com (free tier: 3,000 emails/month)
//   BREVO_API_KEY   — https://brevo.com  (free tier: 300 emails/day)
// Optionally EMAIL_FROM (e.g. "AcadSphere <alerts@yourdomain.com>"). Without a
// verified domain, Resend only delivers to the address that owns the Resend
// account — fine for a demo, but Brevo is the better pick for mailing real
// students, since it delivers to any recipient once the sender is verified.

export type EmailProvider = "resend" | "brevo";

function readKey(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw || raw.includes("${") || raw.includes("your_")) return undefined;
  return raw.replace(/^['"]|['"]$/g, "").trim() || undefined;
}

export function getEmailProvider(): EmailProvider | null {
  if (readKey("RESEND_API_KEY")) return "resend";
  if (readKey("BREVO_API_KEY")) return "brevo";
  return null;
}

function parseFrom(): { name: string; email: string } {
  const raw = readKey("EMAIL_FROM") || "AcadSphere <onboarding@resend.dev>";
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1] || "AcadSphere", email: match[2] };
  return { name: "AcadSphere", email: raw };
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends one email through whichever provider is configured.
 * Throws with a readable message when nothing is configured or the provider
 * rejects the send — callers decide whether that's fatal or just logged.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ provider: EmailProvider }> {
  const provider = getEmailProvider();
  if (!provider) {
    throw new Error(
      "No email provider is configured. Set RESEND_API_KEY (resend.com) or BREVO_API_KEY (brevo.com) in the server environment, plus an optional EMAIL_FROM address.",
    );
  }

  const from = parseFrom();

  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readKey("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${from.name} <${from.email}>`,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
    }
    return { provider };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": readKey("BREVO_API_KEY")!,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: from.name, email: from.email },
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { provider };
}

// ─── Shared HTML shell ────────────────────────────────────────────────────────
// Inlined styles and a table-free layout, because that's what survives Gmail /
// Outlook rendering. Kept deliberately close to the app's own red/cream
// identity so the mail reads as AcadSphere rather than a generic alert.
export function renderEmail(opts: {
  heading: string;
  intro: string;
  rows?: Array<{ label: string; value: string }>;
  callout?: { text: string; tone: "good" | "warn" | "bad" };
  footer?: string;
}): { html: string; text: string } {
  const toneColor =
    opts.callout?.tone === "bad" ? "#B3232C" : opts.callout?.tone === "warn" ? "#B45309" : "#047857";
  const toneBg =
    opts.callout?.tone === "bad" ? "#FDF2F2" : opts.callout?.tone === "warn" ? "#FFFBEB" : "#ECFDF5";

  const rowsHtml = (opts.rows || [])
    .map(
      (r) =>
        `<div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #E7E3DA;">
           <span style="color:#6B6A66;font-size:14px;">${escapeHtml(r.label)}</span>
           <span style="color:#0A0A0A;font-size:14px;font-weight:600;">${escapeHtml(r.value)}</span>
         </div>`,
    )
    .join("");

  const calloutHtml = opts.callout
    ? `<div style="margin-top:20px;padding:12px 14px;border-radius:10px;background:${toneBg};border:1px solid ${toneColor}33;color:${toneColor};font-size:14px;font-weight:600;">
         ${escapeHtml(opts.callout.text)}
       </div>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E3DA;border-radius:16px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #E7E3DA;">
      <span style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#0A0A0A;">Acad<span style="color:#B3232C;">Sphere</span></span>
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#0A0A0A;">${escapeHtml(opts.heading)}</h1>
      <p style="margin:0;color:#4A4945;font-size:15px;line-height:1.6;">${escapeHtml(opts.intro)}</p>
      ${rowsHtml ? `<div style="margin-top:20px;">${rowsHtml}</div>` : ""}
      ${calloutHtml}
    </div>
    <div style="padding:16px 24px;background:#F7F5F0;border-top:1px solid #E7E3DA;color:#8A8985;font-size:12px;line-height:1.5;">
      ${escapeHtml(opts.footer || "You're receiving this because assignment reminders are enabled on your AcadSphere profile.")}
    </div>
  </div>
</body></html>`;

  const text = [
    opts.heading,
    "",
    opts.intro,
    "",
    ...(opts.rows || []).map((r) => `${r.label}: ${r.value}`),
    opts.callout ? `\n${opts.callout.text}` : "",
    "",
    opts.footer || "You're receiving this because assignment reminders are enabled on your AcadSphere profile.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { html, text };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
