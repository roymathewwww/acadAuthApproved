import { type ReactNode, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import {
  LayoutDashboard, Activity, GraduationCap, Radio,
  Megaphone, FileText, Settings, LogOut, Menu, X, Bell,
  Search, Sun, Moon, User, CheckCircle2, ChevronLeft, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface NavItem {
  label: string;
  to: string;
  icon: any;
  badge?: string;
}

// 4 Core Streamlined Admin Modules
const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard },
  { label: "Student Management", to: "/admin/students", icon: GraduationCap },
  { label: "Live Activity", to: "/admin/live-activity", icon: Radio, badge: "Active" },
  { label: "Announcements & Reports", to: "/admin/announcements", icon: Megaphone },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin": "Academic Overview",
  "/admin/students": "Student Records & Directory",
  "/admin/live-activity": "Live Class Activity",
  "/admin/announcements": "Notice Board & Export Reports",
};

export function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const glowRef = useRef<HTMLDivElement>(null);

  const router = useRouterState();
  const currentPath = router.location.pathname;
  const pageTitle = PAGE_TITLES[currentPath] || "Academic Portal";

  const adminEmail = typeof window !== "undefined"
    ? (localStorage.getItem("demo_user_email") || "admin@acadsphere.edu")
    : "admin@acadsphere.edu";

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

  async function handleSignOut() {
    localStorage.removeItem("demo_session_token");
    localStorage.removeItem("demo_user_id");
    localStorage.removeItem("demo_user_email");
    localStorage.removeItem("demo_user_role");
    toast.success("Signed out from Academic Portal");
    navigate({ to: "/auth" });
  }

  function isActive(to: string): boolean {
    if (to === "/admin") return currentPath === "/admin";
    return currentPath === to || currentPath.startsWith(to);
  }

  // Same slow two-tone ambient pulse as the student shell, and a one-time
  // fade-in for the main canvas instead of a hard pop-in.
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

  useEffect(() => {
    gsap.fromTo(
      "[data-admin-shell-fade]",
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.04 },
    );
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground transition-colors duration-200 font-sans antialiased">

      {/* Mobile Overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] md:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ─── Sidebar (retractable — spring width animation) ───────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 248 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col",
          "border-r border-border bg-card/90 backdrop-blur-md",
          "md:static",
          open ? "translate-x-0 !w-64" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Wordmark header — no icon mark, bigger display-serif name with a
            slow ambient two-tone glow behind it */}
        <div className="relative flex h-16 items-center justify-between px-4 border-b border-border shrink-0 overflow-hidden">
          <div
            ref={glowRef}
            className="pointer-events-none absolute -left-8 -top-10 h-24 w-24 rounded-full bg-brand-red opacity-30 blur-3xl"
            aria-hidden
          />
          <Link to="/admin" className="relative z-10 flex items-center min-w-0">
            {!collapsed ? (
              <span className="font-brand text-2xl font-black tracking-tight text-foreground truncate">
                Acad<span className="text-brand-red">Sphere</span>
              </span>
            ) : (
              <span className="font-brand text-xl font-black text-brand-red">A</span>
            )}
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="relative z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1 scrollbar-thin">
          {!collapsed && (
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 mb-2">
              Main Sections
            </p>
          )}

          <nav className="space-y-1">
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block relative group"
                >
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl transition-all duration-150 relative",
                      active
                        ? "text-foreground bg-brand-red/10"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  >
                    {active && (
                      <motion.div
                        layoutId="activeAdminNavIndicator"
                        className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-brand-red"
                        transition={{ type: "spring", stiffness: 450, damping: 30 }}
                      />
                    )}
                    <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-105", active ? "text-brand-red" : "")} />
                    {!collapsed && <span>{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span className="ml-auto text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {item.badge}
                      </span>
                    )}
                  </motion.div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Profile & Controls */}
        <div className="border-t border-border p-3 shrink-0 bg-muted/30">
          <div className={cn("flex items-center", collapsed ? "justify-center flex-col gap-2" : "justify-between")}>
            <button
              onClick={toggleTheme}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {!collapsed && (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase font-bold text-muted-foreground hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
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

      {/* ─── Main Content Canvas ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" data-admin-shell-fade>

        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card/80 px-6 shrink-0 z-10 backdrop-blur-md">

          {/* Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent transition-colors md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden md:flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Workspace
              </span>
              <span className="text-border">/</span>
              <span className="font-sans text-xs font-semibold text-foreground">
                {pageTitle}
              </span>
            </div>
          </div>

          {/* Search Pill */}
          <div className="flex-1 max-w-sm mx-4 hidden sm:block">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search students, USNs, or records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs font-sans rounded-full border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-red/40 focus:border-brand-red/40 transition-all duration-150"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 px-3 py-1 rounded-full">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Campus Network Healthy</span>
            </div>

            <button
              onClick={() => toast.info("No unread alerts.")}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="System Alerts"
            >
              <Bell className="h-4 w-4" />
            </button>

            {/* Profile Avatar */}
            <div className="relative">
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center p-0.5 rounded-full ring-2 ring-brand-gold/50 hover:ring-brand-gold transition-all"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-brand-gold text-brand-gold-foreground font-bold text-xs">
                    AD
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
                      className="absolute right-0 top-full mt-2 w-52 z-50 rounded-2xl border border-border bg-popover/95 backdrop-blur-xl py-2 shadow-lg space-y-0.5"
                    >
                      <div className="px-4 py-2 border-b border-border mb-1">
                        <p className="font-sans text-xs font-bold text-foreground">Academic Controller</p>
                        <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                          {adminEmail}
                        </p>
                      </div>

                      <Link
                        to="/admin"
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5" />
                        Academic Overview
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

        {/* Main Body */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-background scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
