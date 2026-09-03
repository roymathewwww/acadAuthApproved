import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalyticsSummary, updateProfile } from "@/lib/analytics.functions";
import { deriveDepartment } from "@/lib/derive-department";
import { toast } from "sonner";
import {
  Edit3, Check, Loader2, Building2, Mail, LogOut, MessageCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getSummaryFn = useServerFn(getAnalyticsSummary);
  const updateProfileFn = useServerFn(updateProfile);

  const { data: analytics, isLoading, refetch } = useQuery({
    queryKey: ["analyticsSummary"],
    queryFn: () => getSummaryFn(),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: "", degree: "", semester: "", targetRole: "", skills: "",
  });

  const saveProfile = useMutation({
    mutationFn: (data: typeof profileForm) => updateProfileFn({ data }),
    onSuccess: (_, variables) => {
      localStorage.setItem("demo_user_name", variables.fullName);
      toast.success("Profile updated");
      setIsEditing(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["analyticsSummary"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to update profile"),
  });

  const [sessionUser, setSessionUser] = useState<{ name: string; email: string; avatar: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (session?.user) {
        const u = session.user;
        const meta = u.user_metadata || {};
        const name = meta.full_name || meta.name || u.email?.split("@")[0] || "Christ Student";
        const email = u.email || "";
        const avatar = meta.avatar_url || meta.picture || "";
        setSessionUser({ name, email, avatar });
        if (typeof window !== "undefined") {
          localStorage.setItem("demo_user_name", name);
          localStorage.setItem("demo_user_email", email);
          if (avatar) localStorage.setItem("demo_user_avatar", avatar);
        }
      }
    });
  }, []);

  // ── Reminder-email settings (moved here from the old Settings page) ──────
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("sms_notifications_enabled")
          .eq("id", user.id)
          .single();
        if (data) setSmsEnabled(data.sms_notifications_enabled ?? true);
      } catch (_) {}
    })();
  }, []);

  // Reminders now go to the signed-in email address, so there's nothing to
  // collect here beyond the on/off preference. sms_notifications_enabled is
  // reused as the general notifications flag rather than migrating the column.
  const handleSavePhone = async () => {
    setPhoneSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("profiles")
        .update({ sms_notifications_enabled: smsEnabled })
        .eq("id", user.id);
      if (error) throw error;
      setPhoneSaved(true);
      toast.success(
        smsEnabled
          ? "Saved — you'll get reminder emails before each deadline."
          : "Saved — reminder emails are turned off.",
      );
      setTimeout(() => setPhoneSaved(false), 3000);
    } catch (e: any) {
      toast.error(`Failed to save preference: ${e.message}`);
    } finally {
      setPhoneSaving(false);
    }
  };

  async function handleSignOut() {
    localStorage.removeItem("demo_session_token");
    localStorage.removeItem("demo_user_id");
    localStorage.removeItem("demo_user_email");
    localStorage.removeItem("demo_user_role");
    supabase.auth.signOut().catch(() => {});
    toast.success("Signed out");
    navigate({ to: "/" });
  }

  const userRole = typeof window !== "undefined" ? (localStorage.getItem("demo_user_role") || "student") : "student";
  const storedName = typeof window !== "undefined" ? localStorage.getItem("demo_user_name") : null;
  const storedEmail = typeof window !== "undefined" ? localStorage.getItem("demo_user_email") : null;
  const storedAvatar = typeof window !== "undefined" ? localStorage.getItem("demo_user_avatar") : null;

  const profile = analytics?.profile;
  const displayName = sessionUser?.name || storedName || profile?.fullName || storedEmail?.split("@")[0] || "Christ Student";
  const displayEmail = sessionUser?.email || storedEmail || "";
  const displayDegree = profile?.degree || deriveDepartment(displayEmail);
  const displayRole = profile?.targetRole || "";

  const initials = displayName
    .split(" ").map((n: string) => n[0]).filter(Boolean).join("").substring(0, 2).toUpperCase() || "CS";

  const startEdit = () => {
    setProfileForm({
      fullName: displayName,
      degree: displayDegree,
      semester: profile?.semester || "",
      targetRole: profile?.targetRole || "",
      skills: Array.isArray(profile?.skills) ? profile.skills.join(", ") : "",
    });
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <ChatLayout activeThreadId={null}>
        <div className="flex h-full items-center justify-center bg-background text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs font-medium">Loading profile...</span>
        </div>
      </ChatLayout>
    );
  }

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full bg-background text-foreground overflow-y-auto scrollbar-thin transition-colors duration-200">

        {/* Header */}
        <div className="relative overflow-hidden px-6 md:px-8 py-8 border-b border-border bg-card">
          <div className="relative flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
            <div className="flex items-start gap-4 sm:gap-5 min-w-0">
              <div className="relative shrink-0">
                <Avatar className="h-16 w-16 rounded-2xl shadow-sm border border-border">
                  <AvatarImage src={storedAvatar || ""} alt={displayName} />
                  <AvatarFallback className="bg-brand-red text-brand-red-foreground font-black text-xl">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 border-2 border-card flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-display font-black tracking-tight text-foreground break-words">{displayName}</h1>
                </div>

                {displayEmail && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 min-w-0">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-mono text-xs text-foreground font-semibold break-all">{displayEmail}</span>
                  </div>
                )}

                {displayRole && (
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    {displayDegree} · {displayRole}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-muted border border-border px-3 py-1 rounded-full text-foreground">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Christ University (Bangalore)
                  </span>
                  <span className="text-[11px] font-semibold bg-muted border border-border px-3 py-1 rounded-full text-foreground">
                    {displayDegree}{profile?.semester ? ` · ${profile.semester}` : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isEditing && (
                <Button onClick={startEdit} variant="outline" className="h-9 text-xs font-bold gap-1.5">
                  <Edit3 className="h-3.5 w-3.5" /> Edit Profile
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 md:px-8 py-6 grid gap-6 md:grid-cols-2 max-w-4xl">

          {/* Left: Account Details / Edit Form */}
          <div className="space-y-4">
            {isEditing ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Edit Profile Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(profileForm); }} className="space-y-3">
                    <div>
                      <Label htmlFor="fullName" className="text-[10px] font-bold uppercase text-muted-foreground">Full Name</Label>
                      <Input id="fullName" value={profileForm.fullName} onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })} className="h-8 text-xs mt-1 font-semibold" required />
                    </div>
                    <div>
                      <Label htmlFor="degree" className="text-[10px] font-bold uppercase text-muted-foreground">Degree / Department</Label>
                      <Input id="degree" value={profileForm.degree} onChange={(e) => setProfileForm({ ...profileForm, degree: e.target.value })} className="h-8 text-xs mt-1 font-semibold" required />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="semester" className="text-[10px] font-bold uppercase text-muted-foreground">Semester</Label>
                        <Input id="semester" value={profileForm.semester} onChange={(e) => setProfileForm({ ...profileForm, semester: e.target.value })} className="h-8 text-xs mt-1 font-semibold" />
                      </div>
                      <div>
                        <Label htmlFor="targetRole" className="text-[10px] font-bold uppercase text-muted-foreground">Target Role</Label>
                        <Input id="targetRole" value={profileForm.targetRole} onChange={(e) => setProfileForm({ ...profileForm, targetRole: e.target.value })} className="h-8 text-xs mt-1 font-semibold" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="skills" className="text-[10px] font-bold uppercase text-muted-foreground">Skills (comma-separated)</Label>
                      <Input id="skills" value={profileForm.skills} onChange={(e) => setProfileForm({ ...profileForm, skills: e.target.value })} className="h-8 text-xs mt-1 font-semibold" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button type="submit" disabled={saveProfile.isPending} className="flex-1 h-8 text-xs">
                        {saveProfile.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                      <Button type="button" onClick={() => setIsEditing(false)} variant="outline" className="flex-1 h-8 text-xs">
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {[
                    { label: "Full Name", value: displayName },
                    { label: "Email Address", value: displayEmail || "—" },
                    { label: "Institution", value: "Christ University (Bangalore)" },
                    { label: "Account Role", value: userRole === "class_leader" ? "Class Leader" : userRole === "teacher" ? "Class Teacher" : "Student" },
                    { label: "Degree", value: displayDegree },
                  ].map((item) => (
                    <div key={item.label} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                      <p className="text-[9.5px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</p>
                      <p className="font-semibold text-foreground mt-0.5 break-words">{item.value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Settings (merged in) */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3 border-b border-border/60">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg border border-border bg-muted flex items-center justify-center text-foreground">
                    <MessageCircle className="h-3.5 w-3.5" />
                  </div>
                  Assignment Reminder Emails
                </CardTitle>
                <CardDescription className="text-[10px]">Get emailed 12h, 6h, and 1h before a deadline — even when the app is closed.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Enable reminder emails</p>
                    <p className="text-[10px] text-muted-foreground">Automated alerts for pending and overdue submissions</p>
                  </div>
                  <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
                </div>
                {smsEnabled && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-mono text-foreground truncate">{displayEmail || "your account email"}</span>
                    </div>
                    <Button onClick={handleSavePhone} disabled={phoneSaving} className="h-8 text-xs px-4 font-semibold w-full sm:w-auto">
                      {phoneSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : phoneSaved ? <><Check className="h-3 w-3 mr-1" /> Saved!</> : "Save preference"}
                    </Button>
                    <p className="text-[10px] text-muted-foreground">
                      Reminders go to the address you signed in with — 12h before, 6h before, 1h before, plus a daily nudge while a submission stays overdue (up to 14 days). Sync Classroom after saving to activate them.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-brand-red/25 bg-brand-red/5">
              <CardHeader className="pb-3 border-b border-brand-red/10">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-brand-red flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-brand-red/10 flex items-center justify-center">
                    <LogOut className="h-3.5 w-3.5 text-brand-red" />
                  </div>
                  Account
                </CardTitle>
                <CardDescription className="text-[10px]">Sign out of your current session.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Sign Out</p>
                    <p className="text-[10px] text-muted-foreground">Clears your local session and returns to the home page.</p>
                  </div>
                  <Button onClick={handleSignOut} variant="outline" className="h-8 px-4 text-xs font-bold border-brand-red/30 text-brand-red hover:bg-brand-red/10 hover:border-brand-red/50">
                    <LogOut className="h-3.5 w-3.5 mr-1.5" /> Log Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </ChatLayout>
  );
}
