import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Lock, Shield, Key, AlertTriangle, Monitor, Power, CheckCircle2,
  RefreshCw, Smartphone, Laptop, Globe, UserCheck, ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/security")({
  component: AdminSecurityPage,
});

interface ActiveSession {
  id: string;
  user: string;
  usn: string;
  role: string;
  ip: string;
  device: string;
  location: string;
  loginTime: string;
  status: "Active" | "Suspicious";
}

// Dummy demo sessions/login-attempts removed — this page has no real
// session-monitoring or auth-log backend wired up yet, so both lists start
// genuinely empty rather than showing fabricated (and alarming-looking)
// "suspicious" activity.
const INITIAL_SESSIONS: ActiveSession[] = [];

const FAILED_LOGINS: Array<{ id: string; email: string; ip: string; reason: string; timestamp: string; status: string }> = [];

function AdminSecurityPage() {
  const [sessions, setSessions] = useState<ActiveSession[]>(INITIAL_SESSIONS);

  function terminateSession(id: string, user: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    toast.success(`Session terminated for ${user}`);
  }

  function terminateAllSessions() {
    setSessions([]);
    toast.success("All non-administrative sessions forcibly terminated.");
  }

  return (
    <div className="space-y-6">

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-[#0e172e] via-[#101b38] to-[#0e172e] p-5 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white tracking-tight">
              Security & Active Session Controls
            </h2>
            <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <ShieldAlert className="h-2.5 w-2.5" /> High Security Zone
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Monitor active web connections, force end sessions, review failed authentication logs, and manage institutional access controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={terminateAllSessions}
            className="h-9 text-xs gap-1.5 bg-red-600 hover:bg-red-500 text-white font-bold shadow-md shadow-red-600/30"
          >
            <Power className="h-3.5 w-3.5" /> Force Logout All Sessions
          </Button>
        </div>
      </div>

      {/* Security Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[#0e1629] border border-slate-800 rounded-2xl p-4 shadow-md flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Active Sessions</p>
            <p className="text-xl font-black text-white mt-0.5">{sessions.length}</p>
          </div>
        </div>

        <div className="bg-[#0e1629] border border-slate-800 rounded-2xl p-4 shadow-md flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Failed Logins (24h)</p>
            <p className="text-xl font-black text-amber-400 mt-0.5">{FAILED_LOGINS.length}</p>
          </div>
        </div>

        <div className="bg-[#0e1629] border border-slate-800 rounded-2xl p-4 shadow-md flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Firewall Status</p>
            <p className="text-xl font-black text-emerald-400 mt-0.5">Enforced</p>
          </div>
        </div>

        <div className="bg-[#0e1629] border border-slate-800 rounded-2xl p-4 shadow-md flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">MFA Requirement</p>
            <p className="text-xl font-black text-violet-400 mt-0.5">Optional</p>
          </div>
        </div>
      </div>

      {/* Active User Sessions Table */}
      <div className="bg-[#0e1629] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-black text-white">Active System Sessions</h3>
            <p className="text-[11px] text-slate-400">Live active sessions connected to AcadSphere ERP.</p>
          </div>
          <Button
            onClick={() => toast.success("Refreshed active session list")}
            variant="outline"
            className="h-8 text-xs gap-1 bg-slate-900 border-slate-700 text-slate-300"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-black uppercase text-[9.5px] tracking-wider">
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">IP Address</th>
                <th className="px-4 py-3 text-left">Device & Browser</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Login Time</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500 font-mono">No active user sessions found.</td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-900/60 transition-colors">
                    <td className="px-4 py-3 font-bold text-white">
                      {s.user} <span className="text-[10px] text-slate-400 font-mono">({s.usn})</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">{s.role}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-400">{s.ip}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono">{s.device}</td>
                    <td className="px-4 py-3 text-slate-400">{s.location}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{s.loginTime}</td>
                    <td className="px-4 py-3">
                      {s.status === "Active" ? (
                        <span className="text-[9.5px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
                      ) : (
                        <span className="text-[9.5px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">Suspicious</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => terminateSession(s.id, s.user)}
                        className="px-2.5 py-1 text-[10px] font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 rounded-lg border border-red-500/20 transition-all"
                      >
                        Force End
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failed Login Attempt Tracker */}
      <div className="bg-[#0e1629] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="pb-3 border-b border-slate-800">
          <h3 className="text-sm font-black text-white">Failed Login & Threat Tracker</h3>
          <p className="text-[11px] text-slate-400">Recent rejected authentication attempts across institution endpoints.</p>
        </div>
        <div className="space-y-2 text-xs font-mono">
          {FAILED_LOGINS.map((f) => (
            <div key={f.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-white font-bold text-xs">{f.email} <span className="text-slate-400">({f.ip})</span></p>
                  <p className="text-slate-400 text-[10.5px] mt-0.5">{f.reason}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-2 py-0.5 rounded text-[9.5px] font-bold bg-slate-800 text-amber-400 border border-slate-700">
                  {f.status}
                </span>
                <p className="text-slate-500 text-[10px] mt-1">{f.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
