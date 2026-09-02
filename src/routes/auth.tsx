import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { localDemoLogin } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { deriveDepartment } from "@/lib/derive-department";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, GraduationCap, CheckCircle2, Sparkles, Mail, Lock, User as UserIcon } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in · AcadSphere" },
      { name: "description", content: "Sign in with your Google account or email & password to sync schedule, assignments, and AI assistant." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const localLoginFn = useServerFn(localDemoLogin);

  /* — Show a message if redirected here for being removed from a class — */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(location.search).get("removed") === "1") {
      toast.error("You have been removed from your class.", {
        description: "Contact your class teacher if you believe this is a mistake.",
      });
    }
  }, [location.search]);

  /* — Check Session & Auto-provision Profile on Return — */
  useEffect(() => {
    if (location.pathname.includes("/callback")) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const user = data.user;
        const meta = user.user_metadata || {};
        const fullName = meta.full_name || meta.name || user.email?.split("@")[0] || "Christ Student";

        // Auto-provision default student profile if missing
        supabase
          .from("profiles")
          .upsert([
            {
              id: user.id,
              full_name: fullName,
              degree: deriveDepartment(user.email),
              updated_at: new Date().toISOString(),
            },
          ])
          .then(() => {
            toast.success(`Welcome to AcadSphere, ${fullName}!`);
            navigate({ to: "/app", replace: true });
          });
      }
    }).catch(() => {});

    const demoToken = localStorage.getItem("demo_session_token");
    if (demoToken) {
      navigate({ to: "/app", replace: true });
    }
  }, [navigate, location.pathname]);

  if (location.pathname.includes("/callback")) {
    return <Outlet />;
  }

  /* — Google OAuth Handler — */
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes:
            "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me",
          queryParams: {
            prompt: "consent",
          },
        },
      });

      if (error) {
        toast.error(`Google OAuth error: ${error.message}`);
        setGoogleLoading(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to launch Google sign-in");
      setGoogleLoading(false);
    }
  };

  /* — Quick Demo Login Handlers — */
  async function handleDemoLogin() {
    setDemoLoading(true);
    try {
      const result = await localLoginFn({
        data: { email: "aadharsh.krishnaa.g@mca.christuniversity.in", password: "2547201", name: "AADHARSH KRISHNAA G" },
      });
      localStorage.setItem("demo_session_token", result.token);
      localStorage.setItem("demo_user_id", result.userId);
      localStorage.setItem("demo_user_email", result.email);
      localStorage.setItem("demo_user_role", "student");
      toast.success("Signed in as AADHARSH KRISHNAA G (Christ MCA)");
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setDemoLoading(false);
    }
  }

  /* — Standard Email / Password Sign In & Sign Up Handler — */
  async function handleEmailPasswordAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);

    try {
      const trimmedEmail = email.trim();

      if (mode === "signin") {
        // 1. Try Supabase Auth signInWithPassword
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (data?.user) {
          const user = data.user;

          // Class-roles: block a removed student right at the login attempt,
          // before any session state is written — matches "whoever is
          // removed will get a message when trying to login".
          const { data: removalCheck } = await supabase
            .from("profiles")
            .select("removed_at")
            .eq("id", user.id)
            .maybeSingle();
          if (removalCheck?.removed_at) {
            await supabase.auth.signOut().catch(() => {});
            toast.error("You have been removed from your class.", {
              description: "Contact your class teacher if you believe this is a mistake.",
            });
            setLoading(false);
            return;
          }

          const assignedRole = user.user_metadata?.role || "student";

          localStorage.setItem("demo_session_token", `sb_session_${user.id}`);
          localStorage.setItem("demo_user_id", user.id);
          localStorage.setItem("demo_user_email", user.email || trimmedEmail);
          localStorage.setItem("demo_user_role", assignedRole);

          // Auto-provision/sync profile in Supabase
          try {
            await supabase.from("profiles").upsert([
              {
                id: user.id,
                full_name: user.user_metadata?.full_name || trimmedEmail.split("@")[0],
                degree: deriveDepartment(user.email || trimmedEmail),
                updated_at: new Date().toISOString(),
              },
            ]);
          } catch (_) {}

          // Also sync SQLite fallback
          try {
            await localLoginFn({
              data: { email: user.email || trimmedEmail, password, name: user.user_metadata?.full_name },
            });
          } catch (_) {}

          toast.success(`Welcome back, ${user.email}!`);
          navigate({ to: "/app", replace: true });
          return;
        }

        // 2. If Supabase Auth returns an error, attempt local DB fallback (for pre-existing demo accounts)
        try {
          const result = await localLoginFn({
            data: { email: trimmedEmail, password, name: name || undefined },
          });

          localStorage.setItem("demo_session_token", result.token);
          localStorage.setItem("demo_user_id", result.userId);
          localStorage.setItem("demo_user_email", result.email);
          localStorage.setItem("demo_user_role", result.role || "student");
          toast.success(`Welcome, ${result.name || result.email}!`);
          navigate({ to: "/app", replace: true });
          return;
        } catch (_) {
          // Show Supabase error if neither succeeded
          throw new Error(error?.message || "Invalid email or password");
        }

      } else {
        // Sign Up Mode
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: { full_name: name || trimmedEmail.split("@")[0] },
          },
        });

        if (error) {
          throw new Error(error.message);
        }

        if (data?.user) {
          const user = data.user;
          // Local fallback creation
          const result = await localLoginFn({
            data: { email: trimmedEmail, password, name: name || trimmedEmail.split("@")[0] },
          });

          localStorage.setItem("demo_session_token", result.token || `sb_session_${user.id}`);
          localStorage.setItem("demo_user_id", user.id || result.userId);
          localStorage.setItem("demo_user_email", trimmedEmail);
          localStorage.setItem("demo_user_role", "student");

          toast.success("Account created successfully!");
          navigate({ to: "/app", replace: true });
          return;
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#0A0A0A] flex font-sans">

      {/* ─── Left Editorial Branding Panel ─── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-[#F4F2EC] border-r border-[#E0DDD4]">
        <Link to="/" className="flex items-center">
          <span className="font-brand font-black text-lg tracking-tight text-[#0A0A0A]">
            Acad<span className="text-brand-red">Sphere</span>
          </span>
        </Link>

        <div className="space-y-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-[#0A0A0A]/10 text-[#0A0A0A]">
            <Sparkles className="h-3 w-3" />
            Christ University Student OS
          </span>

          <h1
            className="font-sans font-black text-[#0A0A0A] leading-[1.05]"
            style={{ fontSize: "clamp(2.25rem, 3.5vw, 3.25rem)", letterSpacing: "-0.04em" }}
          >
            Your academic
            <br />
            command centre.
          </h1>

          <p className="text-sm font-sans text-muted-foreground leading-relaxed max-w-md">
            Integrated student information system & Google Classroom sync for Christ University students, faculty, and academic controllers.
          </p>

          <div className="space-y-3.5 pt-4">
            {[
              "Live Google Classroom Sync & Submissions Tracker",
              "AI Academic Assistant & Intelligent Smart Notes",
              "Real-Time Attendance Telemetry & Course Metrics",
              "Career Roadmap & Placement Preparation Hub",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-[#0A0A0A]/10 text-[#0A0A0A] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-sans font-semibold text-[#0A0A0A]">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          © 2026 AcadSphere Inc. · Version 3.0 · Editorial Edition
        </p>
      </div>

      {/* ─── Right Auth Form Panel ──────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">

        {/* Mobile Branding Header */}
        <Link to="/" className="flex items-center mb-8 lg:hidden">
          <span className="font-brand font-black text-lg tracking-tight text-[#0A0A0A]">
            Acad<span className="text-brand-red">Sphere</span>
          </span>
        </Link>

        <div className="w-full max-w-md space-y-6">

          {/* Title Header */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black font-sans tracking-tight text-[#0A0A0A]">
              Sign in to AcadSphere
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use your Google Mail account or your registered Supabase / university credentials.
            </p>
          </div>

          {/* ── Google OAuth Button ──────────────── */}
          <div className="rounded-2xl border border-[#E0DDD4] bg-[#F4F2EC] p-4 shadow-sm text-center">
            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full h-11 rounded-xl border border-[#E0DDD4] bg-white hover:bg-[#FAF9F5] text-[#0A0A0A] text-xs font-bold flex items-center justify-center gap-3 transition-all duration-150 shadow-sm active:scale-[0.98] disabled:opacity-60"
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#0A0A0A]" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{googleLoading ? "Redirecting to Google..." : "Continue with Google Mail"}</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E0DDD4]" />
            </div>
            <span className="relative bg-[#FAFAF8] px-3 font-mono text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Or sign in with email & password
            </span>
          </div>

          {/* ── Standard Email / Password Form ──────────────── */}
          <div className="rounded-2xl border border-[#E0DDD4] bg-[#F4F2EC] p-6 space-y-4 shadow-sm">
            {/* Mode Switcher Tabs */}
            <div className="flex bg-[#EAE7DC] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  mode === "signin"
                    ? "bg-white text-[#0A0A0A] shadow-sm"
                    : "text-muted-foreground hover:text-[#0A0A0A]"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  mode === "signup"
                    ? "bg-white text-[#0A0A0A] shadow-sm"
                    : "text-muted-foreground hover:text-[#0A0A0A]"
                }`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleEmailPasswordAuth} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-bold text-[#0A0A0A]">
                    Full Name
                  </Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Aadharsh Krishnaa"
                      className="h-10 pl-9 text-xs border-[#E0DDD4] bg-white focus-visible:ring-black"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-bold text-[#0A0A0A]">
                  Email Address / Mail ID
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@mca.christuniversity.in"
                    className="h-10 pl-9 text-xs border-[#E0DDD4] bg-white focus-visible:ring-black"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-bold text-[#0A0A0A]">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    placeholder="••••••••"
                    className="h-10 pl-9 text-xs border-[#E0DDD4] bg-white focus-visible:ring-black"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-10 font-bold bg-[#0A0A0A] text-[#ffffff] hover:opacity-90 transition-all shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {mode === "signin" ? "Authenticating Supabase..." : "Creating Account..."}
                  </>
                ) : mode === "signin" ? (
                  "Sign In with Supabase"
                ) : (
                  "Create Supabase Account"
                )}
              </Button>
            </form>
          </div>

          {/* Quick Demo Access Bar */}
          <div className="rounded-2xl border border-[#E0DDD4] bg-[#F4F2EC] p-4 space-y-2.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
              Quick University Demo Access
            </p>
            <Button
              onClick={handleDemoLogin}
              disabled={demoLoading}
              variant="outline"
              type="button"
              className="w-full h-9 text-xs font-bold gap-1.5 border-[#E0DDD4] bg-white text-[#0A0A0A] hover:bg-[#EAE7DC]"
            >
              <GraduationCap className="h-3.5 w-3.5 text-[#0A0A0A]" />
              Demo Student
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
