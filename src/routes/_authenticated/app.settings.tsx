import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { interpretSettlerInstruction } from "@/lib/settler.functions";
import { updateProfile } from "@/lib/analytics.functions";
import {
  Settings, Bell, Lock, Monitor, Sun, Moon, Palette, Zap, Shield, Check,
  Bot, Send, User, Sparkles, MessageSquare, Loader2, RefreshCw, LogOut, Phone, MessageCircle
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: SettingsPage,
});

interface ChatMessage {
  sender: "user" | "settler";
  text: string;
  timestamp: string;
}

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"preferences" | "settler">("preferences");

  // General state
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [vivaAudits, setVivaAudits] = useState(false);
  const [analyticsSharing, setAnalyticsSharing] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const [saved, setSaved] = useState(false);
  const [accentColor, setAccentColor] = useState("blue");

  // SMS Notifications state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  // Settler Chat state
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: "settler",
      text: "Hello! I am Settler, your autonomous workspace setup agent. I can configure themes, change profile info, post updates, or schedule assessments directly. Tell me what needs fixing or changing!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const interpretFn = useServerFn(interpretSettlerInstruction);
  const updateProfileFn = useServerFn(updateProfile);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const theme = localStorage.getItem("theme");
    setIsDark(theme !== "light");
    const accent = localStorage.getItem("accent") || "blue";
    setAccentColor(accent);

    // Load phone number and SMS prefs from Supabase profiles
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleThemeChange = (checked: boolean) => {
    setIsDark(checked);
    if (checked) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
    toast.success(`Switched to ${checked ? "Dark" : "Light"} mode`);
  };

  const handleSave = () => {
    localStorage.setItem("settings_email_alerts", String(emailAlerts));
    localStorage.setItem("settings_viva_audits", String(vivaAudits));
    localStorage.setItem("settings_analytics", String(analyticsSharing));
    setSaved(true);
    toast.success("Preferences saved!");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSavePhone = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Please enter a valid phone number.");
      return;
    }
    setPhoneSaving(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
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
    const { supabase } = await import("@/integrations/supabase/client");
    supabase.auth.signOut().catch(() => {});
    toast.success("Signed out successfully");
    navigate({ to: "/" });
  }

  // Settler executor logic
  const handleInstruction = useMutation({
    mutationFn: (text: string) => interpretFn({ data: { instruction: text } }),
    onSuccess: async (res) => {
      const settlerMsg: ChatMessage = {
        sender: "settler",
        text: res.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, settlerMsg]);

      // Execute structured actions locally if returned
      if (res.action) {
        const { type, params } = res.action;

        // 1. Theme Change
        if (type === "theme" && params.value) {
          const darkChecked = params.value === "dark";
          handleThemeChange(darkChecked);
        }

        // 2. Accent Change
        else if (type === "accent" && params.value) {
          setAccentColor(params.value);
          localStorage.setItem("accent", params.value);
          toast.success(`Theme accent set to ${params.value}`);
        }

        // 3. Profile details change
        else if (type === "profile") {
          try {
            await updateProfileFn({
              data: {
                fullName: params.fullName || "Student Name",
                degree: params.degree || "B.Tech CSE",
                semester: params.semester || "Semester 6",
                targetRole: params.targetRole || "Frontend Engineer",
                skills: params.skills || "",
              }
            });
            qc.invalidateQueries({ queryKey: ["analyticsSummary"] });
            toast.success("Profile updated successfully!");
          } catch (e: any) {
            toast.error("Failed to update profile: " + e.message);
          }
        }

        // 5. Community Forum post
        else if (type === "community") {
          try {
            const savedPostsStr = localStorage.getItem("acadsphere_community_posts") || "[]";
            const posts = JSON.parse(savedPostsStr);
            const newPost = {
              id: Date.now().toString(),
              author: "You (via Settler)",
              avatar: "YO",
              channel: params.channel || "#general-chat",
              content: params.content,
              likes: 0,
              likedByMe: false,
              time: "Just now",
              timestamp: Date.now()
            };
            posts.unshift(newPost);
            localStorage.setItem("acadsphere_community_posts", JSON.stringify(posts));
            toast.success(`Published post to ${newPost.channel}!`);
          } catch (_) {}
        }
      }
    },
    onError: () => {
      setMessages(prev => [...prev, {
        sender: "settler",
        text: "I encountered an error trying to interpret that instruction. Please check the AI config key or try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }
  });

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: chatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    const textToSend = chatInput;
    setChatInput("");

    handleInstruction.mutate(textToSend);
  };

  const ACCENT_COLORS = [
    { id: "blue", label: "Ocean Blue", class: "bg-blue-500" },
    { id: "violet", label: "Electric Violet", class: "bg-violet-500" },
    { id: "emerald", label: "Emerald", class: "bg-emerald-500" },
    { id: "rose", label: "Rose", class: "bg-rose-500" },
    { id: "amber", label: "Amber", class: "bg-amber-500" },
    { id: "cyan", label: "Cyan", class: "bg-cyan-500" },
  ];

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full bg-background text-foreground flex flex-col transition-colors duration-200">

        {/* Header */}
        <div className="px-6 py-5 border-b border-border/80 bg-card/60 backdrop-blur-md shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl border border-border/80 bg-muted/60 flex items-center justify-center text-foreground shrink-0 shadow-xs">
                <Settings className="h-4.5 w-4.5" />
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-foreground">Workspace Preferences</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">Modify settings manually or instruct Settler AI agent</p>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex bg-muted/60 border border-border p-0.5 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setActiveTab("preferences")}
                className={`px-3 py-1 rounded-md transition-all ${activeTab === "preferences" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Preferences
              </button>
              <button
                onClick={() => setActiveTab("settler")}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${activeTab === "settler" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Bot className="h-3.5 w-3.5" /> Settler AI
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 bg-muted/10">
          <div className="max-w-2xl mx-auto">
            {activeTab === "preferences" ? (
              <div className="space-y-5">
                {/* Appearance */}
                <Card className="card-gradient border-border shadow-sm">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border/80 bg-muted/60 flex items-center justify-center text-foreground">
                        <Palette className="h-3.5 w-3.5" />
                      </div>
                      Visual Appearance
                    </CardTitle>
                    <CardDescription className="text-[10px]">Theme and color accent preferences.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-5">
                    {/* Dark/Light toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-amber-500/10 text-amber-500"}`}>
                          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{isDark ? "Dark Mode" : "Light Mode"}</p>
                          <p className="text-[10px] text-muted-foreground">Reduces eye strain in dim environments</p>
                        </div>
                      </div>
                      <Switch checked={isDark} onCheckedChange={handleThemeChange} />
                    </div>

                    {/* Accent Colors */}
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">Accent Color</p>
                      <div className="flex gap-2 flex-wrap">
                        {ACCENT_COLORS.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setAccentColor(c.id);
                              localStorage.setItem("accent", c.id);
                              toast.success(`Accent set to ${c.label}`);
                            }}
                            title={c.label}
                            className={`h-7 w-7 rounded-full ${c.class} flex items-center justify-center transition-all hover:scale-110 shadow-sm ${accentColor === c.id ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/30" : ""}`}
                          >
                            {accentColor === c.id && <Check className="h-3 w-3 text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notifications */}
                <Card className="card-gradient border-border shadow-sm">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border/80 bg-muted/60 flex items-center justify-center text-foreground">
                        <Bell className="h-3.5 w-3.5" />
                      </div>
                      Notifications & Alerts
                    </CardTitle>
                    <CardDescription className="text-[10px]">Manage syllabus, exam, and placement notification triggers.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {[
                      {
                        key: "email", label: "Email Notifications", desc: "Weekly performance summaries and placement drive alerts",
                        checked: emailAlerts, onChange: setEmailAlerts
                      },
                      {
                        key: "viva", label: "Viva Score Reports", desc: "Instant grading reports after simulator completions",
                        checked: vivaAudits, onChange: setVivaAudits
                      },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                        </div>
                        <Switch checked={item.checked} onCheckedChange={item.onChange} />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* SMS Assignment Reminders */}
                <Card className="card-gradient border-border shadow-sm">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border/80 bg-muted/60 flex items-center justify-center text-foreground">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </div>
                      SMS Assignment Reminders
                    </CardTitle>
                    <CardDescription className="text-[10px]">Get SMS alerts at 24h, 6h, and 1h before deadlines — even when the app is closed.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Enable SMS Reminders</p>
                        <p className="text-[10px] text-muted-foreground">Receive automated SMS for pre-due and overdue assignments</p>
                      </div>
                      <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
                    </div>

                    {/* Phone number input */}
                    {smsEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="phone-number" className="text-xs font-semibold">
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3" /> Mobile Number (with country code)
                          </span>
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="phone-number"
                            type="tel"
                            placeholder="e.g. +919876543210"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="h-8 text-xs font-mono bg-background border-border flex-1"
                          />
                          <Button
                            onClick={handleSavePhone}
                            disabled={phoneSaving}
                            className={`h-8 text-xs px-4 font-semibold ${
                              phoneSaved
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                : "bg-primary hover:bg-blue-700 text-white"
                            }`}
                          >
                            {phoneSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : phoneSaved ? (
                              <><Check className="h-3 w-3 mr-1" /> Saved!</>
                            ) : "Save"}
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          You'll get SMS: 24h before, 6h before, 1h before, and daily overdue alerts (up to 14 days).
                          Sync Classroom after saving to activate reminders.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSave}
                    className={`font-bold text-xs px-6 h-9 shadow-sm transition-all ${
                      saved
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                        : "bg-primary hover:bg-blue-700 text-white"
                    }`}
                  >
                    {saved ? <><Check className="h-3.5 w-3.5 mr-1.5" /> Saved!</> : "Save Preferences"}
                  </Button>
                </div>

                {/* Sign Out */}
                <Card className="border-red-500/20 bg-red-500/5 shadow-sm">
                  <CardHeader className="pb-3 border-b border-red-500/10">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-red-500 flex items-center gap-2">
                      <div className="h-6 w-6 rounded-lg bg-red-500/10 flex items-center justify-center">
                        <LogOut className="h-3.5 w-3.5 text-red-500" />
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
                      <Button
                        onClick={handleSignOut}
                        variant="outline"
                        className="h-8 px-4 text-xs font-bold border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50"
                      >
                        <LogOut className="h-3.5 w-3.5 mr-1.5" />
                        Log Out
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* Settler AI Agent Interface */
              <Card className="border-border bg-card shadow-lg flex flex-col h-[550px] overflow-hidden rounded-2xl">
                <CardHeader className="pb-3 border-b border-border/60 bg-muted/20 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl border border-border/80 bg-muted flex items-center justify-center text-foreground shadow-xs">
                      <Bot className="h-4.5 w-4.5 text-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground">Settler Autopilot</CardTitle>
                      <CardDescription className="text-[10px] mt-0.5">Tell Settler what config changes to make or problems to fix.</CardDescription>
                    </div>
                  </div>
                </CardHeader>

                {/* Chat window */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex items-start gap-2.5 ${m.sender === "user" ? "flex-row-reverse" : ""}`}>
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border border-border/70 ${
                        m.sender === "user" ? "bg-foreground text-background" : "bg-muted text-foreground"
                      }`}>
                        {m.sender === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      </div>
                      <div className="space-y-1 max-w-[80%]">
                        <div className={`rounded-xl px-3.5 py-2.5 text-xs shadow-sm leading-relaxed ${
                          m.sender === "user" ? "bg-primary text-white" : "bg-muted border border-border"
                        }`}>
                          {m.text}
                        </div>
                        <span className="text-[8px] text-muted-foreground block px-1">{m.timestamp}</span>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <form onSubmit={handleSendChat} className="p-3 border-t border-border bg-muted/10 flex gap-2 shrink-0">
                  <Input
                    placeholder="e.g. 'switch to dark mode', 'change major to CSE and target role to Backend Engineer'..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 h-9 text-xs bg-muted/40 border-border focus:ring-1 focus:ring-primary"
                    disabled={handleInstruction.isPending}
                  />
                  <Button
                    type="submit"
                    disabled={handleInstruction.isPending || !chatInput.trim()}
                    className="h-9 px-4 bg-primary hover:bg-blue-700 text-white font-bold"
                  >
                    {handleInstruction.isPending ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <Send className="h-4.5 w-4.5" />
                    )}
                  </Button>
                </form>
              </Card>
            )}
          </div>
        </div>
      </div>
    </ChatLayout>
  );
}
