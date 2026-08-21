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
  Edit3, Check, Loader2, Shield, Building2, Mail, LogOut, Phone, MessageCircle,
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

  const userRole = typeof window !== "undefined" ? (localStorage.getItem("demo_user_role") || "student") : "student";
  const isAdmin = userRole === "admin";

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

  // ── SMS reminder settings (moved here from the old Settings page) ────────
  const [phoneNumber, setPhoneNumber] = useState("");
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
          .select("phone_number, sms_notifications_enabled")
          .eq("id", user.id)
          .single();
        if (data) {
          setPhoneNumber(data.phone_number || "");
          setSmsEnabled(data.sms_notifications_enabled ?? true);
        }
      } catch (_) {}
    })();
  }, []);

  const handleSavePhone = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Please enter a valid phone number.");
      return;
    }
    setPhoneSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("profiles")
        .update({ phone_number: phoneNumber.trim(), sms_notifications_enabled: smsEnabled })
        .eq("id", user.id);
      if (error) throw error;
      setPhoneSaved(true);
      toast.success("Phone number saved! You'll receive SMS reminders for upcoming assignments.");
      setTimeout(() => setPhoneSaved(false), 3000);
    } catch (e: any) {
      toast.error(`Failed to save phone number: ${e.message}`);
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

  const storedName = typeof window !== "undefined" ? localStorage.getItem("demo_user_name") : null;
  const storedEmail = typeof window !== "undefined" ? localStorage.getItem("demo_user_email") : null;
  const storedAvatar = typeof window !== "undefined" ? localStorage.getItem("demo_user_avatar") : null;

  const profile = analytics?.profile;
  const displayName = isAdmin
    ? "Academic Controller"
    : (sessionUser?.name || storedName || profile?.fullName || storedEmail?.split("@")[0] || "Christ Student");
  const displayEmail = sessionUser?.email || storedEmail || "";
  const displayDegree = profile?.degree || deriveDepartment(displayEmail);
  const displayRole = isAdmin ? "Institutional Oversight Officer" : (profile?.targetRole || "");

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
          <div className="relative flex items-start gap-5">
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

            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-display font-black tracking-tight text-foreground">{displayName}</h1>
                {isAdmin && (
                  <span className="text-[10px] font-bold bg-muted text-foreground px-2 py-0.5 rounded-full border border-border font-mono">
                    Admin Controller
                  </span>
                )}
              </div>

              {displayEmail && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="font-mono text-xs text-foreground font-semibold">{displayEmail}</span>
                </div>
              )}

              {displayRole && (
                <p className="text-xs text-muted-foreground mt-1">
                  {displayDegree} · {displayRole}
                </p>
              )}

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-muted border border-border px-3 py-1 rounded-full text-foreground">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Christ University (Bangalore)
                </span>
                {isAdmin ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full">
                    <Shield className="h-3.5 w-3.5" /> Full Access
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold bg-muted border border-border px-3 py-1 rounded-full text-foreground">
                    {displayDegree}{profile?.semester ? ` · ${profile.semester}` : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isAdmin && !isEditing && (
                <Button onClick={startEdit} variant="outline" className="h-9 text-xs font-bold gap-1.5">
                  <Edit3 className="h-3.5 w-3.5" /> Edit Profile
                </Button>
              )}
              {isAdmin && (
                <Button onClick={() => navigate({ to: "/admin" })} className="h-9 text-xs font-bold gap-1.5 shrink-0">
                  <Shield className="h-3.5 w-3.5" /> Admin Overview
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
                    { label: "Account Role", value: isAdmin ? "Academic Controller" : (userRole === "class_leader" ? "Class Leader" : "Student") },
                    { label: "Degree", value: displayDegree },
                  ].map((item) => (
                    <div key={item.label} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                      <p className="text-[9.5px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</p>
                      <p className="font-semibold text-foreground mt-0.5">{item.value}</p>
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
                  SMS Assignment Reminders
                </CardTitle>
                <CardDescription className="text-[10px]">Get SMS alerts at 24h, 6h, and 1h before deadlines — even when the app is closed.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Enable SMS Reminders</p>
                    <p className="text-[10px] text-muted-foreground">Receive automated SMS for pre-due and overdue assignments</p>
                  </div>
                  <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
                </div>
                {smsEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="phone-number" className="text-xs font-semibold">
                      <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> Mobile Number (with country code)</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="phone-number" type="tel" placeholder="e.g. +919876543210"
                        value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                        className="h-8 text-xs font-mono flex-1"
                      />
                      <Button onClick={handleSavePhone} disabled={phoneSaving} className="h-8 text-xs px-4 font-semibold">
                        {phoneSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : phoneSaved ? <><Check className="h-3 w-3 mr-1" /> Saved!</> : "Save"}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      You'll get SMS: 24h before, 6h before, 1h before, and daily overdue alerts (up to 14 days). Sync Classroom after saving to activate reminders.
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
