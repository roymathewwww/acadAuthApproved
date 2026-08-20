// supabase/functions/send-demo-sms/index.ts
// On-demand demo SMS for live presentations.
// Called directly from the browser with live classroom counts.

const FAST2SMS_API_KEY = Deno.env.get("FAST2SMS_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Fast2SMS "Quick SMS" helper ────────────────────────────────────────────
// Free-credit, DLT-exempt route meant for exactly this kind of low-volume,
// custom-text alert (unlike Twilio trial accounts, it doesn't force
// predefined templates). Expects a bare 10-digit Indian mobile number —
// no "+91" / country code — so we strip anything else off first.
async function sendSms(to: string, body: string): Promise<void> {
  const digits = to.replace(/\D/g, "");
  const number = digits.length > 10 ? digits.slice(-10) : digits;
  if (number.length !== 10) {
    throw new Error(`Fast2SMS: "${to}" is not a valid 10-digit Indian mobile number`);
  }

  const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: FAST2SMS_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      route: "q",
      message: body,
      language: "english",
      flash: "0",
      numbers: number,
    }).toString(),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.return !== true) {
    throw new Error(`Fast2SMS ${res.status}: ${JSON.stringify(json)}`);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    // Parse the live classroom data sent from the frontend
    const {
      pending = 0,
      overdue = 0,
      completed = 0,
      total = 0,
      courses = 0,
      phone,
      userName = "Student",
    } = await req.json();

    // Resolve the destination phone number
    const toPhone: string = phone || Deno.env.get("DEMO_SMS_FALLBACK_PHONE") || "";
    if (!toPhone) {
      return new Response(
        JSON.stringify({ success: false, error: "No destination phone number" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      day: "numeric",
      month: "short",
    });

    const message = [
      `📚 AcadSphere Live Report — ${now}`,
      `Hi ${userName}! Here's your classroom snapshot:`,
      ``,
      `📋 Total Assignments: ${total}`,
      `⏳ Pending Submissions: ${pending}`,
      `🚨 Overdue (Action Needed): ${overdue}`,
      `✅ Submitted / Graded: ${completed}`,
      `📖 Active Subjects: ${courses}`,
      ``,
      overdue > 0
        ? `⚠️ You have ${overdue} overdue assignment${overdue > 1 ? "s" : ""} — submit ASAP!`
        : `🎉 No overdue assignments — great job!`,
    ].join("\n");

    await sendSms(toPhone, message);

    return new Response(
      JSON.stringify({ success: true, sentTo: toPhone }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-demo-sms error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
