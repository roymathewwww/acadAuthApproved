import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("Extracting security tokens...");
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;

    const processImplicitFlow = async () => {
      try {
        hasProcessed.current = true;
        const hash = window.location.hash;
        const search = window.location.search;

        // ── 0. Check for explicit OAuth error in query or hash params ──────────
        const qp = new URLSearchParams(search);
        const hashClean = hash.replace(/^#/, "");
        const hp = new URLSearchParams(hashClean);
        const oauthError =
          qp.get("error_description") ||
          qp.get("error") ||
          hp.get("error_description") ||
          hp.get("error");

        if (oauthError) {
          throw new Error(`OAuth Error: ${decodeURIComponent(oauthError)}`);
        }

        // ── 1. PKCE Authorization Code Flow (?code=...) ────────────────────────
        const code = qp.get("code");
        if (code) {
          setStatus("Exchanging authorization code...");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data?.session) {
            await finalizeSession(data.session);
            return;
          }
        }

        // ── 2. Implicit Flow — hash contains tokens ────────────────────────────
        if (hash && hash.length > 1) {
          setStatus("Validating tokens...");

          const accessToken = hp.get("access_token");
          const refreshToken = hp.get("refresh_token");
          // Grab provider_token from hash — this is the Google OAuth Bearer token
          const providerToken = hp.get("provider_token");

          if (!accessToken || !refreshToken) {
            throw new Error("Missing access_token or refresh_token in the URL redirect.");
          }

          setStatus("Establishing secure session...");
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;

          if (data?.session) {
            // Attach the hash-parsed provider_token if Supabase didn't pick it up
            const sessionWithToken = {
              ...data.session,
              provider_token: data.session.provider_token || providerToken || undefined,
            };
            await finalizeSession(sessionWithToken);
            return;
          }
        }

        // ── 3. Supabase may have already established the session natively ───────
        const { data: existing } = await supabase.auth.getSession();
        if (existing?.session) {
          await finalizeSession(existing.session);
          return;
        }

        throw new Error("No authentication tokens found in the URL and no active session detected.");
      } catch (err: any) {
        console.error("Auth Callback Error:", err);
        setErrorLog(err?.message || "A fatal error occurred during token extraction.");
      }
    };

    const finalizeSession = async (session: any) => {
      const user = session.user;
      const meta = user?.user_metadata || {};
      const fullName =
        meta.full_name || meta.name || user?.email?.split("@")[0] || "Student";
      const avatarUrl = meta.avatar_url || meta.picture || "";

      // Prefer session.provider_token (already merged from hash above), then fall back to nothing
      const finalProviderToken = session.provider_token || "";

      setStatus("Persisting Classroom credentials...");

      // ── Strictly populate localStorage before navigation ─────────────────────
      if (typeof window !== "undefined") {
        localStorage.setItem("demo_session_token", session.access_token);
        localStorage.setItem("demo_user_id", user.id);
        localStorage.setItem("demo_user_email", user.email || "");
        localStorage.setItem("demo_user_name", fullName);
        if (avatarUrl) localStorage.setItem("demo_user_avatar", avatarUrl);
        if (finalProviderToken) {
          localStorage.setItem("google_provider_token", finalProviderToken);
        }
        localStorage.setItem("demo_user_role", "student");
      }

      // ── Non-blocking profile upsert ──────────────────────────────────────────
      supabase
        .from("profiles")
        .upsert([
          {
            id: user.id,
            full_name: fullName,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          },
        ])
        .then(({ error }) => {
          if (error) console.warn("[auth/callback] Profile upsert non-critical:", error.message);
        });

      // ── Clean the hash to prevent re-processing on browser back ─────────────
      window.history.replaceState(null, "", window.location.pathname);

      setStatus("✅ Success! Redirecting to Workspace...");

      // ── Navigate via TanStack Router (avoids full page reload / hydration wipe)
      setTimeout(() => {
        navigate({ to: "/app", replace: true });
      }, 400);
    };

    // Also subscribe to Supabase auth events — handles cases where Supabase SDK
    // auto-processes the hash before our effect runs
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (
          (event === "SIGNED_IN" ||
            event === "INITIAL_SESSION" ||
            event === "TOKEN_REFRESHED") &&
          session &&
          !hasProcessed.current
        ) {
          hasProcessed.current = true;
          await finalizeSession(session);
        }
      }
    );

    processImplicitFlow();

    return () => {
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errorLog) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8 bg-[#FAFAF8] text-[#0A0A0A] font-sans">
        <h2 className="text-red-600 font-bold text-xl mb-4">Authentication Failed</h2>
        <div className="p-4 bg-red-950 text-red-300 font-mono text-sm rounded-xl w-full max-w-lg text-center shadow whitespace-pre-wrap break-words border border-red-800">
          {errorLog}
        </div>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto">
          <button
            onClick={() => navigate({ to: "/auth", replace: true })}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#0A0A0A] text-white hover:bg-[#222222] rounded-xl transition-all text-xs font-bold shadow"
          >
            Back to Sign In
          </button>
          <button
            onClick={() => {
              localStorage.setItem("demo_session_token", "demo_emergency_session");
              localStorage.setItem("demo_user_id", "demo_user");
              localStorage.setItem("demo_user_email", "student@christuniversity.in");
              localStorage.setItem("demo_user_role", "student");
              navigate({ to: "/app", replace: true });
            }}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#EAE7DC] text-[#0A0A0A] hover:bg-[#DDD9C9] rounded-xl transition-all text-xs font-bold border border-[#E0DDD4]"
          >
            Continue as Guest / Demo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAFAF8] text-[#0A0A0A] font-sans">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
      <p className="font-bold text-sm">{status}</p>
    </div>
  );
}
