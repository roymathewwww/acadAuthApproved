import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { localDemoLogin } from "@/lib/auth.functions";
import { toast } from "sonner";
import {
  Brain, Compass, Calendar, FileCheck2, LineChart, ArrowRight,
  Code, Volume2, Users, Sparkles, Award, Globe, Lock, Sun, Moon,
  BookOpen, CalendarDays, CheckCircle2, LayoutDashboard, User, Settings,
  Loader2, LogIn, Zap, GraduationCap, Wand2, FileOutput
} from "lucide-react";
import { FluidFlowGrid } from "@/components/ui/fluid-flow-grid";
import { motion } from "framer-motion";

export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "AcadSphere — Premium AI Academic Operating System" },
      {
        name: "description",
        content:
          "AcadSphere is a precision-built AI platform for engineering students: career roadmaps, smart notes, lab buddy, placement tracking, and more.",
      },
    ],
  }),
  component: Landing,
}));

const STATS = [
  { value: "45,000+", label: "AI queries resolved" },
  { value: "98.2%",   label: "Placement readiness" },
  { value: "12,000+", label: "Study hours logged" },
  { value: "15+",     label: "Institutions integrated" },
];

const FEATURES = [
  { icon: LayoutDashboard, title: "Dashboard",          desc: "A single command center showing attendance, deadlines, AI insights, and progress at a glance." },
  { icon: Sparkles,        title: "AI Study Assistant", desc: "Interactive contextual explanations tailored directly to your syllabus subjects." },
  { icon: GraduationCap,   title: "Classroom",          desc: "Syllabus tracking, assignment submissions, course resources, and faculty announcements." },
  { icon: Wand2,           title: "Resume Tailorer",    desc: "Executive 1-page ATS PDF builder, job description matching, and AI bullet optimization." },
  { icon: CheckCircle2,    title: "Attendance Tracker", desc: "Real-time attendance percentage, subject-wise risk flags, and CUE Portal auto-sync." },
  { icon: FileOutput,      title: "File Converter",     desc: "Fast in-browser PDF, DOCX, image, and text format conversions." },
  { icon: Users,           title: "Community",          desc: "Connect with batchmates, share resources, ask questions, and collaborate on projects." },
  { icon: User,            title: "Profile",            desc: "Maintain your academic profile, skill tags, certifications, and placement preferences." },
  { icon: Settings,        title: "Settings",           desc: "Personalise themes, notification channels, AI tuning, and linked integrations." },
];

const TESTIMONIALS = [
  {
    quote: "AcadSphere turned my exam prep from chaos into a structured game plan. The AI Assistant and Smart Notes are insanely helpful for quick revisions.",
    author: "Aditya Verma",
    role: "MCA Student, RV College of Engineering",
    initials: "AV",
  },
  {
    quote: "With the Resume Builder and Career Roadmap, I went from applying blindly to landing three interview rounds. It's like having a senior developer coaching you 24/7.",
    author: "Neha Sharma",
    role: "B.Tech CSE, SRM University",
    initials: "NS",
  },
];

function Landing() {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [isAuthSuccess, setIsAuthSuccess] = useState(false);
  const localLoginFn = useServerFn(localDemoLogin);

  async function handleLandingLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const result = await localLoginFn({ data: { email: loginEmail, password: loginPassword } });
      localStorage.setItem("demo_session_token", result.token);
      localStorage.setItem("demo_user_id", result.userId);
      localStorage.setItem("demo_user_email", result.email);
      localStorage.setItem("demo_user_role", result.role || "student");
      setIsAuthSuccess(true);
      toast.success(`Welcome back, ${result.name || result.email}!`);
      setTimeout(() => {
        navigate({ to: result.role === "admin" ? "/admin" : "/app", replace: true });
      }, 350);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleDemoAccess() {
    setDemoLoading(true);
    try {
      const result = await localLoginFn({ data: { email: "demo@acadsphere.local", password: "demo123456", name: "Demo Student" } });
      localStorage.setItem("demo_session_token", result.token);
      localStorage.setItem("demo_user_id", result.userId);
      localStorage.setItem("demo_user_email", result.email);
      localStorage.setItem("demo_user_role", result.role || "student");
      setIsAuthSuccess(true);
      toast.success("Signed in as Demo Student");
      setTimeout(() => {
        navigate({ to: result.role === "admin" ? "/admin" : "/app", replace: true });
      }, 350);
    } catch (err) {
      toast.error("Demo login failed");
    } finally {
      setDemoLoading(false);
    }
  }

  useEffect(() => {
    const theme = localStorage.getItem("theme");
    if (theme === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      {/* ─── Fluid Flow Grid Canvas Background ─────────────────── */}
      <FluidFlowGrid isDark={isDark} isSuccess={isAuthSuccess} />

      {/* ─── Floating Pill Navigation ───────────────────────── */}
      <div className="sticky top-0 z-50 flex justify-center pt-4 px-6">
        <motion.header
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-5xl flex items-center justify-between px-5 h-12 nav-pill transition-editorial"
          style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
        >
          {/* Wordmark */}
          <Link to="/" className="flex items-center">
            <motion.span
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="font-brand font-black text-base tracking-tight text-foreground"
            >
              Acad<span className="text-brand-red">Sphere</span>
            </motion.span>
          </Link>

          {/* Center nav */}
          <nav className="hidden md:flex items-center gap-0">
            {["#features", "#stats", "#testimonials", "#login"].map((href, i) => {
              const labels = ["Modules", "Impact", "Testimonials", "Sign In"];
              return (
                <motion.a
                  key={href}
                  href={href}
                  whileHover="hover"
                  initial="rest"
                  className="relative font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors duration-[120ms] px-3 py-1.5"
                >
                  {labels[i]}
                  <motion.span
                    variants={{ rest: { scaleX: 0, opacity: 0 }, hover: { scaleX: 1, opacity: 1 } }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute left-3 right-3 -bottom-0.5 h-[1.5px] bg-brand-red origin-left"
                  />
                </motion.a>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.12, rotate: -12 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleTheme}
              className="p-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors duration-[120ms]"
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </motion.header>
      </div>

      {/* ─── Hero Section ───────────────────────────────────── */}
      <section className="relative pt-20 pb-24 md:pt-32 md:pb-36 overflow-hidden">
        {/* Subtle editorial grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 flex flex-col items-center text-center">

          {/* Overline label */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="inline-flex items-center gap-2 mb-6"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-foreground" />
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Version 2.0 · Professional Academic Workspace
            </span>
          </motion.div>

          {/* Big non-linear wordmark, above the tagline */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
            className="flex flex-col leading-none select-none mb-2"
          >
            <span
              className="font-wordmark-script text-foreground text-[4.5rem] sm:text-[6rem] leading-none -rotate-6 self-center -mb-4 sm:-mb-6"
            >
              Acad
            </span>
            <span className="font-wordmark-block text-brand-red text-[6rem] sm:text-[9rem] leading-[0.75] tracking-tight">
              SPHERE
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
            className="font-display font-black text-foreground mt-4"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", letterSpacing: "-0.04em", lineHeight: 1.05 }}
          >
            The premium academic
            <br />
            operating system for
            <br />
            <span className="text-brand-red">high achievers.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.25 }}
            className="mt-8 max-w-lg text-base font-sans text-muted-foreground leading-relaxed"
          >
            Consolidate notes, career roadmaps, lab manuals, and mock examinations
            into a single unified workspace — engineered for serious engineering students.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.35 }}
            className="mt-10 flex flex-wrap justify-center gap-3"
          >
            <Button asChild size="lg">
              <Link to="/auth">
                Start Your Journey
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#features">Explore Modules</a>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─── Statistics Bar ─────────────────────────────────── */}
      <section id="stats" className="border-t border-border py-14 bg-card">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            {STATS.map((stat) => (
              <div key={stat.label} className="px-6 first:pl-0 last:pr-0 text-center md:text-left">
                <p
                  className="font-display font-black text-foreground"
                  style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.04em", lineHeight: 1.1 }}
                >
                  {stat.value}
                </p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Feature Catalog ────────────────────────────────── */}
      <section id="features" className="py-24 border-t border-border">
        <div className="mx-auto max-w-5xl px-6">

          <div className="mb-16">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-4">
              Unified Platform
            </p>
            <h2
              className="font-display font-black text-foreground"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", letterSpacing: "-0.04em", lineHeight: 1.1 }}
            >
              13 engineered modules
              <br />
              for every academic stage.
            </h2>
            <p className="mt-6 max-w-xl text-sm font-sans text-muted-foreground leading-relaxed">
              A comprehensive toolset sharing academic context to optimise learning,
              verify gaps, and boost placement readiness — all inside one platform.
            </p>
          </div>

          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 border border-border rounded-2xl overflow-hidden bg-border">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="group bg-card p-6 transition-colors duration-[120ms] hover:bg-accent"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-sans font-semibold text-[13px] text-foreground leading-tight">
                        {feat.title}
                      </h3>
                      <p className="mt-1.5 text-[12px] font-sans text-muted-foreground leading-relaxed">
                        {feat.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ─── Testimonials ───────────────────────────────────── */}
      <section id="testimonials" className="py-24 border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-6">

          <div className="mb-16">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-4">
              Student Testimonials
            </p>
            <h2
              className="font-display font-black text-foreground"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", letterSpacing: "-0.04em", lineHeight: 1.1 }}
            >
              Loved by serious
              <br />
              engineering students.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {TESTIMONIALS.map((t, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-background p-8 flex flex-col justify-between"
              >
                {/* Large quotation mark */}
                <p
                  className="font-sans text-foreground/10 font-black leading-none mb-4"
                  style={{ fontSize: "5rem", lineHeight: 1 }}
                  aria-hidden="true"
                >
                  "
                </p>
                <p className="font-sans text-[15px] text-foreground leading-relaxed -mt-6">
                  {t.quote}
                </p>
                <div className="mt-8 flex items-center gap-3 pt-6 border-t border-border">
                  <div className="h-9 w-9 rounded-full border border-border bg-muted flex items-center justify-center">
                    <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                      {t.initials}
                    </span>
                  </div>
                  <div>
                    <p className="font-sans font-semibold text-[13px] text-foreground">{t.author}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground mt-0.5">
                      {t.role}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Login Section ───────────────────────────────────── */}
      <section id="login" className="py-24 border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-6 grid lg:grid-cols-2 gap-16 items-center">

          {/* Left: copy */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-4">
              Ready to start?
            </p>
            <h2
              className="font-display font-black text-foreground"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", letterSpacing: "-0.04em", lineHeight: 1.05 }}
            >
              Sign in to your
              <br />
              <span className="text-muted-foreground">AcadSphere workspace.</span>
            </h2>
            <p className="mt-6 text-sm font-sans text-muted-foreground leading-relaxed max-w-sm">
              No email confirmation. Your session is stored locally — works fully offline.
              New user? Just enter any email + password to create an account instantly.
            </p>
            {/* Quick demo access */}
            <button
              onClick={handleDemoAccess}
              disabled={demoLoading}
              className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground border border-border rounded-full px-4 py-2 transition-colors duration-[120ms] hover:bg-accent disabled:opacity-60"
            >
              {demoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Quick Demo — No sign-up needed
            </button>
          </div>

          {/* Right: login form */}
          <div className="rounded-2xl border border-border bg-background p-8">
            <div className="flex items-center gap-2.5 mb-6">
              <div>
                <p className="font-brand font-black text-base text-foreground">
                  Acad<span className="text-brand-red">Sphere</span>
                </p>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">Sign in · Works offline</p>
              </div>
            </div>

            <form onSubmit={handleLandingLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="landing-email" className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Email</Label>
                <Input
                  id="landing-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="landing-password" className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Password</Label>
                <Input
                  id="landing-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  minLength={6}
                  required
                  className="h-10"
                />
              </div>
              <Button type="submit" disabled={loginLoading} className="w-full h-10">
                {loginLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
                ) : (
                  <><LogIn className="h-4 w-4" /> Sign In / Create Account</>
                )}
              </Button>
            </form>

            <div className="mt-5 pt-5 border-t border-border">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground text-center">
                New user? Just enter any email + password above — account is created automatically.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ─── CTA Section ────────────────────────────────────── */}
      <section className="py-32 border-t border-border">
        <div className="mx-auto max-w-5xl px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-4">
              Get Started
            </p>
            <h2
              className="font-display font-black text-foreground"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.04em", lineHeight: 1.05 }}
            >
              Redefine your
              <br />
              learning speed today.
            </h2>
          </div>
          <div className="flex flex-col gap-4 items-start lg:items-end">
            <p className="max-w-sm text-sm font-sans text-muted-foreground leading-relaxed lg:text-right">
              Register your profile, configure your syllabus and target role, and let
              AcadSphere build your success framework.
            </p>
            <Button asChild size="lg">
              <Link to="/auth">
                Create Account
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-start justify-between gap-8">

          {/* Left: brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="font-brand font-black text-base text-foreground">
                Acad<span className="text-brand-red">Sphere</span>
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              © 2026 AcadSphere Inc.
            </p>
          </div>

          {/* Right: links */}
          <nav className="flex items-center gap-6">
            {[
              { href: "#features", label: "Modules" },
              { href: "#testimonials", label: "Testimonials" },
              { href: "#stats", label: "Impact" },
              { href: "/auth", label: "Sign In" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors duration-[120ms]"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>

    </div>
  );
}
