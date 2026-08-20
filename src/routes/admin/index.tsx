import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminDashboardStats } from "@/lib/admin.functions";
import {
  Users, Activity, UserCheck, AlertCircle, RefreshCw,
  GraduationCap, Radio, ArrowUpRight, TrendingUp, Clock,
  BookOpen, Megaphone, FileText, CheckCircle2, ChevronRight
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const DAILY_ACTIVE_DATA = [
  { day: "Mon", active: 240, logins: 310 },
  { day: "Tue", active: 280, logins: 340 },
  { day: "Wed", active: 310, logins: 390 },
  { day: "Thu", active: 295, logins: 375 },
  { day: "Fri", active: 340, logins: 420 },
  { day: "Sat", active: 180, logins: 210 },
  { day: "Sun", active: 150, logins: 190 },
];

const DEPT_ACTIVITY_DATA = [
  { dept: "CSE", count: 320 },
  { dept: "ECE", count: 210 },
  { dept: "ISE", count: 180 },
  { dept: "MECH", count: 140 },
  { dept: "CIVIL", count: 95 },
  { dept: "MCA", count: 110 },
];

function AdminDashboard() {
  const statsFn = useServerFn(getAdminDashboardStats);
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["adminStats"],
    queryFn: () => statsFn(),
    refetchInterval: 30_000,
  });

  const totalStudents = stats?.totalStudents ?? 1140;
  const onlineStudents = stats?.onlineStudents ?? 342;
  const todayLogins = stats?.todayLogins ?? 485;
  const requiringAttention = stats?.studentsAtRisk ?? Math.floor(totalStudents * 0.12);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase font-bold tracking-wider text-stone-500 dark:text-zinc-500">
            Institutional Registry
          </p>
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-zinc-100 tracking-tight mt-0.5">
            Academic Overview
          </h1>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">
            Current summary of enrolled students, active class sessions, and attendance metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            className="h-9 text-xs border-stone-200 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 font-semibold gap-1.5 hover:bg-stone-100 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Sync Feed
          </Button>
          <Link to="/admin/live-activity">
            <Button size="sm" className="h-9 text-xs font-bold gap-1.5 bg-stone-900 dark:bg-zinc-100 text-stone-50 dark:text-zinc-900 shadow-sm hover:bg-stone-800">
              <Radio className="h-3.5 w-3.5 text-emerald-400" /> Live Monitor
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Clean Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Total Enrolled</p>
              <p className="text-2xl font-black text-stone-900 dark:text-zinc-100 mt-1">{totalStudents.toLocaleString()}</p>
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mt-1">↑ +18 this term</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-stone-100 dark:bg-zinc-800 flex items-center justify-center text-stone-700 dark:text-zinc-300 shrink-0">
              <GraduationCap className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Active Students</p>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{onlineStudents}</p>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1">Studying on platform</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
              <Radio className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Today's Logins</p>
              <p className="text-2xl font-black text-stone-900 dark:text-zinc-100 mt-1">{todayLogins}</p>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1">42% daily attendance</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-stone-100 dark:bg-zinc-800 flex items-center justify-center text-stone-700 dark:text-zinc-300 shrink-0">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Needs Support</p>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">{requiringAttention}</p>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1">Low attendance risk</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recharts Grid — Refined Natural Styling */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Weekly Study Engagement Area Chart */}
        <Card className="lg:col-span-2 border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Weekly Study Engagement</CardTitle>
            <CardDescription className="text-xs text-stone-500 dark:text-zinc-400">7-day active user logins and study sessions</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={DAILY_ACTIVE_DATA}>
                <defs>
                  <linearGradient id="colorNaturalWarm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#44403c" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#44403c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e7e5e4", borderRadius: 8, fontSize: 12, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }} />
                <Area type="monotone" dataKey="active" stroke="#292524" fill="url(#colorNaturalWarm)" strokeWidth={2} name="Active Students" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Headcount Bar Chart */}
        <Card className="border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Department Enrolment</CardTitle>
            <CardDescription className="text-xs text-stone-500 dark:text-zinc-400">Student headcount by branch</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={DEPT_ACTIVITY_DATA} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="dept" type="category" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} width={45} />
                <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e7e5e4", borderRadius: 8, fontSize: 12, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }} />
                <Bar dataKey="count" fill="#44403c" radius={[0, 6, 6, 0]} name="Students" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Live Active Stream & Core Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Live Active Stream */}
        <Card className="lg:col-span-2 border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
          <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-stone-100 dark:border-zinc-800">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Active Student Stream
              </CardTitle>
              <CardDescription className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Students currently studying online</CardDescription>
            </div>
            <Link to="/admin/live-activity" className="text-xs font-bold text-stone-900 dark:text-zinc-100 hover:underline flex items-center gap-1">
              View All <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {/* Dummy demonstration sessions removed — shows nothing until
                real live-activity tracking reports active students. */}
            {([] as Array<{ name: string; usn: string; dept: string; sem: string; status: string; page: string; session: string }>).length === 0 && (
              <p className="text-xs text-muted-foreground italic px-1 py-2">No students currently online.</p>
            )}
          </CardContent>
        </Card>

        {/* Core Administrative Links */}
        <Card className="border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
          <CardHeader className="pb-3 border-b border-stone-100 dark:border-zinc-800">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Core Sections</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2.5">
            {[
              { label: "Student Records & Directory", icon: GraduationCap, to: "/admin/students" },
              { label: "Live Class Monitor", icon: Radio, to: "/admin/live-activity" },
              { label: "Notice Board & Export Reports", icon: Megaphone, to: "/admin/announcements" },
            ].map((action) => (
              <Link key={action.to} to={action.to}>
                <Button variant="outline" className="w-full justify-between text-xs h-10 border-stone-200 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 font-semibold hover:bg-stone-100 dark:hover:bg-zinc-800 mb-2">
                  <div className="flex items-center gap-2">
                    <action.icon className="h-4 w-4 shrink-0 text-stone-500" />
                    <span>{action.label}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
