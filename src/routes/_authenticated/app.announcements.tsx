import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { listAnnouncements, createAnnouncement, getProfileAndRole } from "@/lib/studentos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  Megaphone, Plus, Bell, AlertTriangle, Calendar, 
  Award, Tag, MessageSquare, Loader2, RefreshCw, X, ShieldAlert
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/announcements")({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  // New Notice state
  const [newNotice, setNewNotice] = useState({
    title: "",
    content: "",
    priority: "medium" as "high" | "medium" | "low",
    category: "general" as "academic" | "event" | "placement" | "general",
  });

  // Server functions
  const getProfileFn = useServerFn(getProfileAndRole);
  const listAnnounceFn = useServerFn(listAnnouncements);
  const createAnnounceFn = useServerFn(createAnnouncement);

  // Queries
  const { data: profile } = useQuery({
    queryKey: ["userProfile"],
    queryFn: () => getProfileFn(),
  });

  const { data: notices = [], isLoading: loadingNotices } = useQuery({
    queryKey: ["announcementsList"],
    queryFn: () => listAnnounceFn(),
  });

  const activeRole = profile?.role || "student";
  const isFaculty = activeRole === "faculty" || activeRole === "admin";

  // Mutations
  const createMut = useMutation({
    mutationFn: (data: typeof newNotice) => createAnnounceFn({ data }),
    onSuccess: () => {
      toast.success("Notice broadcasted and sent to all student notifications!");
      setCreateOpen(false);
      setNewNotice({ title: "", content: "", priority: "medium", category: "general" });
      qc.invalidateQueries({ queryKey: ["announcementsList"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to post notice");
    }
  });

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-[#0B0F19] text-slate-100 p-4 sm:p-6 md:p-8 scrollbar-thin">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-orange-400" /> Department Notice & Announcements
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Read urgent faculty broadcasts, academic dates, placement drives, and event updates.
            </p>
          </div>

          {isFaculty && (
            <Button onClick={() => setCreateOpen(true)} className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-8">
              <Plus className="h-3.5 w-3.5 mr-1" /> Broadcast Notice
            </Button>
          )}
        </div>

        {/* Notice board timeline */}
        <div className="max-w-3xl mx-auto space-y-6 text-left">
          {loadingNotices ? (
            <div className="py-20 flex justify-center items-center text-slate-400">
              <RefreshCw className="animate-spin h-5 w-5 mr-1 text-orange-500" /> Fetching announcements timeline...
            </div>
          ) : notices.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">No active notices broadcasted.</div>
          ) : (
            notices.map((notice: any) => {
              const isHigh = notice.priority === "high";
              const isMedium = notice.priority === "medium";

              return (
                <Card 
                  key={notice.id} 
                  className={`bg-slate-900/40 border-slate-800/80 transition-all hover:border-slate-700 relative overflow-hidden ${
                    isHigh ? "border-l-4 border-l-red-500" : isMedium ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-blue-500"
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider font-mono border ${
                          isHigh 
                            ? "bg-red-950/20 border-red-800/40 text-red-400 animate-pulse" 
                            : isMedium 
                              ? "bg-amber-950/20 border-amber-800/40 text-amber-400" 
                              : "bg-blue-950/20 border-blue-800/40 text-blue-400"
                        }`}>
                          {notice.priority} Priority
                        </span>

                        <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono bg-slate-950/30 text-slate-400 border border-slate-850">
                          {notice.category}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-500">
                        {new Date(notice.created_at || Date.now()).toLocaleDateString()}
                      </div>
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-200 mt-2">{notice.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-slate-300 leading-relaxed">{notice.content}</p>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* FACULTY POST NOTICE MODAL OVERLAY */}
        {createOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm grid place-items-center p-4">
            <Card className="bg-[#0F172A] border-slate-850 w-full max-w-md shadow-2xl text-left relative">
              <button onClick={() => setCreateOpen(false)} className="absolute top-2 right-2 h-9 w-9 flex items-center justify-center text-slate-400 hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
              
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <ShieldAlert className="h-4.5 w-4.5 text-orange-400 animate-bounce" /> Broadcast Notice Alert
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createMut.mutate(newNotice);
                }} className="space-y-4">
                  
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Notice Title</label>
                    <Input
                      required
                      value={newNotice.title}
                      onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                      placeholder="e.g. End Semester Practical Schedule Released"
                      className="bg-slate-950/40 border-slate-850 text-slate-200 text-xs h-8"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Detailed Content</label>
                    <textarea
                      required
                      value={newNotice.content}
                      onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
                      placeholder="Provide all timings, links, and rules..."
                      rows={5}
                      className="w-full p-2.5 rounded bg-slate-950/40 border border-slate-850 text-slate-200 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">Priority Level</label>
                      <select
                        value={newNotice.priority}
                        onChange={(e) => setNewNotice({ ...newNotice, priority: e.target.value as any })}
                        className="w-full bg-slate-950/40 border border-slate-850 text-slate-300 text-xs h-8 px-2 rounded focus:outline-none"
                      >
                        <option value="high">High (Red Alert)</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">Broadcast Category</label>
                      <select
                        value={newNotice.category}
                        onChange={(e) => setNewNotice({ ...newNotice, category: e.target.value as any })}
                        className="w-full bg-slate-950/40 border border-slate-850 text-slate-300 text-xs h-8 px-2 rounded focus:outline-none"
                      >
                        <option value="academic">Academic</option>
                        <option value="event">Event / Webinar</option>
                        <option value="placement">Placement Cell</option>
                        <option value="general">General</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button type="submit" disabled={createMut.isPending} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs h-8">
                      {createMut.isPending ? "Broadcasting..." : "Broadcast Notice"}
                    </Button>
                    <Button type="button" onClick={() => setCreateOpen(false)} variant="outline" className="border-slate-800 text-slate-400 text-xs h-8">
                      Cancel
                    </Button>
                  </div>

                </form>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </ChatLayout>
  );
}
