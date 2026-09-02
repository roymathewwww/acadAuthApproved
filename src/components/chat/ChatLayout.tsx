import { type ReactNode, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listThreads, deleteThread } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import {
  Plus, MessageSquare, Trash2, LogOut, Menu,
  LayoutDashboard, BookOpen, Calendar, FileText,
  LineChart, CheckCircle2, Bell, Sparkles,
  User, Code, Volume2, CalendarDays,
  Users, Sun, Moon, X, Activity, GraduationCap, FileOutput,
  Wand2, ChevronLeft, ChevronRight, Layers, Crown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ChatLayout({
  activeThreadId,
  children,
}: {
  activeThreadId: string | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const wordmarkRef = useRef<HTMLSpanElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  const listFn = useServerFn(listThreads);
  const deleteFn = useServerFn(deleteThread);

  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => listFn(),
  });

  const userRole = typeof window !== "undefined"
    ? (localStorage.getItem("demo_user_role") || "student")
    : "student";

  const [sessionUser, setSessionUser] = useState<{ name: string; email: string; avatar: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const meta = u.user_metadata || {};
        const name = meta.full_name || meta.name || u.email?.split("@")[0] || "Student";
        const email = u.email || "";
        const avatar = meta.avatar_url || meta.picture || "";

        setSessionUser({ name, email, avatar });

        if (typeof window !== "undefined") {
          localStorage.setItem("demo_user_name", name);
          localStorage.setItem("demo_user_email", email);
          if (avatar) localStorage.setItem("demo_user_avatar", avatar);
          if (session.provider_token) localStorage.setItem("google_provider_token", session.provider_token);
        }
      }
    });
  }, []);

  const userName = sessionUser?.name || (typeof window !== "undefined"
    ? (localStorage.getItem("demo_user_name") || "Christ Student")
    : "Christ Student");
  const userEmail = sessionUser?.email || (typeof window !== "undefined"
    ? (localStorage.getItem("demo_user_email") || "")
    : "");
  const userAvatar = sessionUser?.avatar || (typeof window !== "undefined"
    ? (localStorage.getItem("demo_user_avatar") || "")
    : "");
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .substring(0, 2)
    .toUpperCase() || "CS";

  // Sync theme
  useEffect(() => {
    const theme = localStorage.getItem("theme");
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Subtle ambient glow behind the wordmark — a slow GSAP pulse between the
  // two brand accents rather than a static flat logo mark.
  useEffect(() => {
    if (!glowRef.current) return;
    const tween = gsap.to(glowRef.current, {
      backgroundColor: "var(--brand-gold)",
      opacity: 0.5,
      duration: 3.2,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
    return () => { tween.kill(); };
  }, []);

  // One-time entrance for the whole shell — keeps the app from just "popping"
  // into place on load.
  useEffect(() => {
    gsap.fromTo(
      "[data-shell-fade]",
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.04 },
    );
  }, []);

  async function handleSignOut() {
    localStorage.removeItem("demo_session_token");
    localStorage.removeItem("demo_user_id");
    localStorage.removeItem("demo_user_email");
    localStorage.removeItem("demo_user_role");
    supabase.auth.signOut().catch(() => {});
    toast.success("Signed out");
    navigate({ to: "/" });
  }

  // Student navigation items
  const studentNavItems = [
    { label: "Dashboard",       to: "/app",                icon: LayoutDashboard },
    { label: "AI Assistant",    to: "/app/ai-assistant",   icon: Sparkles },
    { label: "Classroom",       to: "/app/classroom",      icon: GraduationCap },
    { label: "Resume Tailorer", to: "/app/resume-builder", icon: Wand2 },
    { label: "Attendance",      to: "/app/attendance",     icon: CheckCircle2 },
    { label: "File Converter",  to: "/app/conversions",    icon: FileOutput },
    { label: "Community",       to: "/app/community",      icon: Users },
    { label: "Profile",         to: "/app/profile",        icon: User },
  ];

  // Class Leader (CR) — every student module plus one extra: Class Management.
  const classLeaderNavItems = [
    ...studentNavItems,
    { label: "Class Management", to: "/app/class-management", icon: Layers },
  ];

  // Class Teacher — a deliberately minimal 3-item view, not the full admin panel.
  const teacherNavItems = [
    { label: "Community",  to: "/app/community",   icon: Users },
    { label: "Assign CR",  to: "/app/assign-cr",    icon: Crown },
    { label: "Dashboard",  to: "/app/students",     icon: LayoutDashboard },
  ];

  const isTeacher = userRole === "teacher";
  const isClassLeader = userRole === "class_leader";

  const navItems = isTeacher
    ? teacherNavItems
    : isClassLeader
    ? classLeaderNavItems
    : studentNavItems;

  return (
    <div className="flex h-screen bg-background text-foreground antialiased font-sans overflow-hidden selection:bg-brand-red/20">

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ─── Sidebar (retractable — spring width animation) ───────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 272 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col shrink-0",
          "border-r border-border bg-card/95 backdrop-blur-xl",
          "md:static",
          mobileOpen ? "translate-x-0 !w-64" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Wordmark header — a poster-style two-font lockup (brush script
            over an ultra-condensed display face), stacked non-linearly with
            "Acad" overlapping down into "SPHERE" — a lot taller than the old
            single-line h-16 strip on purpose. */}
        <div className="relative flex items-center justify-between px-4 py-5 border-b border-border shrink-0 overflow-hidden">
          <div
            ref={glowRef}
            className="pointer-events-none absolute -left-8 -top-10 h-32 w-32 rounded-full bg-brand-red opacity-30 blur-3xl"
            aria-hidden
          />
          <Link to="/app" className="relative flex items-center min-w-0 z-10">
            {!collapsed ? (
              <span ref={wordmarkRef} className="flex flex-col leading-none select-none">
                <span
                  className="font-wordmark-script text-brand-gold text-[2.25rem] md:text-[2.75rem] leading-none -rotate-6 origin-bottom-left pl-1"
                  style={{ textShadow: "0 2px 14px color-mix(in srgb, var(--brand-gold) 35%, transparent)" }}
                >
                  Acad
                </span>
                <span className="font-wordmark-block text-brand-red text-[3.25rem] md:text-[4rem] leading-[0.78] tracking-tight -mt-2.5">
                  SPHERE
                </span>
              </span>
            ) : (
              <span className="font-wordmark-block text-3xl text-brand-red">A</span>
            )}
          </Link>

          <button
            onClick={() => setMobileOpen(false)}
            className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1 scrollbar-none">
          {!collapsed && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-3 mb-2 font-medium">
              Modules
            </p>
          )}

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;

              return (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="block relative group"
                >
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-xl transition-all duration-150 relative",
                      isActive
                        ? "text-foreground bg-brand-red/10 font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    )}
                  >
                    {/* Active Accent Indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="activeNavIndicator"
                        className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-brand-red"
                        transition={{ type: "spring", stiffness: 450, damping: 30 }}
                      />
                    )}

                    <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-brand-red" : "text-muted-foreground group-hover:text-foreground")} />

                    {!collapsed && (
                      <span className="truncate tracking-tight">{item.label}</span>
                    )}
                  </motion.div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-border p-2.5 shrink-0 bg-muted/30">
          <div className={cn("flex items-center", collapsed ? "justify-center flex-col gap-2" : "justify-between px-1")}>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors md:h-auto md:w-auto md:p-2"
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.button>

            {!collapsed && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </motion.button>
            )}

            {/* Desktop Collapse Toggle — retracts the sidebar to an icon rail */}
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:flex p-1.5 text-muted-foreground hover:text-brand-red hover:bg-accent rounded-lg transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </motion.button>
          </div>
        </div>
      </motion.aside>

      {/* ─── Main Viewport Area ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background" data-shell-fade>

        {/* Topnav */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card/80 backdrop-blur-xl px-5 shrink-0 z-30">

          {/* Left: Mobile menu & breadcrumbs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent transition-colors md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="hidden md:flex items-center gap-2 text-xs">
              <span className="font-mono text-muted-foreground uppercase tracking-widest text-[10px]">
                Platform
              </span>
              <span className="text-border">/</span>
              <span className="font-medium text-foreground tracking-tight">
                AcadSphere Academic Space
              </span>
            </div>
          </div>

          {/* Right Actions & Profile */}
          <div className="flex items-center gap-2.5">
            {/* Profile Dropdown */}
            <div className="relative">
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center p-1 md:p-0.5 rounded-full ring-2 ring-brand-gold/50 hover:ring-brand-gold transition-all"
              >
                <Avatar className="h-8 w-8 md:h-7 md:w-7">
                  <AvatarImage src={userAvatar} alt={userName} />
                  <AvatarFallback className="bg-brand-gold text-brand-gold-foreground font-semibold text-[10px]">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </motion.button>

              <AnimatePresence>
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute right-0 top-full mt-2 w-56 z-50 rounded-2xl border border-border bg-popover/95 backdrop-blur-xl py-1.5 shadow-lg"
                    >
                      <div className="px-4 py-2.5 border-b border-border mb-1">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {userName}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                          {userEmail}
                        </p>
                      </div>

                      <Link
                        to="/app/profile"
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <User className="h-3.5 w-3.5" />
                        Profile & Credentials
                      </Link>

                      <div className="border-t border-border mt-1 pt-1">
                        <button
                          onClick={() => { setShowProfileMenu(false); handleSignOut(); }}
                          className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-xs font-medium text-brand-red hover:bg-brand-red/10 transition-colors"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
export default ChatLayout;
