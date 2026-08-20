import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import {
  createThread, listThreads, deleteThread, renameThread,
  saveMessage, getThreadMessages
} from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { generateAcademicResponse } from "@/lib/academic-ai.engine";
import { toast } from "sonner";
import {
  useState, useEffect, useRef, useCallback,
} from "react";
import {
  Sparkles, Send, Plus, Search, Trash2, MessageSquare,
  BookOpen, Brain, HelpCircle, Zap, MoreHorizontal,
  PencilLine, X, Loader2, Bot, User, PanelLeft,
} from "lucide-react";
import { AiResponseWriter } from "@/components/ui/ai-response-writer";
import { AnimatePresence, motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/app/ai-assistant")({
  component: AIAssistantPage,
});

/* ─────────────── Types ─────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Thread {
  id: string;
  title: string;
  module: string | null;
  updated_at: string;
}

/* ─────────────── Prompt Templates ─────────────────────── */
const TEMPLATES = [
  {
    icon: BookOpen,
    label: "Summarize Topic",
    color: "text-blue-500",
    bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20",
    prompt: "Summarize the core concepts of Database Normalization (1NF, 2NF, 3NF, BCNF) into clear bullet points with examples.",
  },
  {
    icon: Brain,
    label: "Explain Concept",
    color: "text-purple-500",
    bg: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20",
    prompt: "Explain the Banker's Algorithm for deadlock avoidance with a real-life analogy so a first-year student can understand it.",
  },
  {
    icon: HelpCircle,
    label: "Generate Quiz",
    color: "text-amber-500",
    bg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20",
    prompt: "Generate 5 challenging multiple-choice questions on Computer Networks (TCP/UDP, OSI Model, IP Subnetting) with answers and explanations.",
  },
  {
    icon: Zap,
    label: "Make Flashcards",
    color: "text-pink-500",
    bg: "bg-pink-500/10 hover:bg-pink-500/20 border-pink-500/20",
    prompt: "Create 6 active-recall flashcards for Operating System Semaphores and Mutexes. Format each as Front (Question) and Back (Answer).",
  },
];

/* ─────────────── Helper: Group Threads by Date ─────────── */
function groupThreadsByDate(threads: Thread[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7 = new Date(today.getTime() - 7 * 86400000);
  const last30 = new Date(today.getTime() - 30 * 86400000);

  const groups: Record<string, Thread[]> = {
    Today: [],
    Yesterday: [],
    "Last 7 Days": [],
    "Last 30 Days": [],
    Older: [],
  };

  for (const t of threads) {
    const d = new Date(t.updated_at);
    if (d >= today) groups.Today.push(t);
    else if (d >= yesterday) groups.Yesterday.push(t);
    else if (d >= last7) groups["Last 7 Days"].push(t);
    else if (d >= last30) groups["Last 30 Days"].push(t);
    else groups.Older.push(t);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

/* ─────────────── Main Component ─────────────────────────── */
function AIAssistantPage() {
  const qc = useQueryClient();
  const createFn = useServerFn(createThread);
  const listFn = useServerFn(listThreads);
  const deleteFn = useServerFn(deleteThread);
  const renameFn = useServerFn(renameThread);
  const saveMsgFn = useServerFn(saveMessage);
  const getMsgsFn = useServerFn(getThreadMessages);

  /* — thread list state — */
  const { data: threads = [], isLoading: threadsLoading } = useQuery<Thread[]>({
    queryKey: ["threads"],
    queryFn: () => listFn() as Promise<Thread[]>,
    refetchInterval: 30000,
  });

  /* — active chat state — */
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Separate state for the in-progress assistant message being streamed.
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);

  // Accumulated content during a stream — mutated by ref, flushed via RAF
  const streamBufferRef = useRef("");
  const rafRef = useRef<number | null>(null);

  /* — sidebar UI state — */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* — auto-scroll — */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isStreaming]);

  /* — load messages when switching threads via server function — */
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    getMsgsFn({ data: { threadId: activeThreadId } })
      .then((res) => {
        if (res && res.messages) {
          const loaded: Message[] = res.messages.map((m: any) => {
            let content = "";
            try {
              const parts = typeof m.parts === "string" ? JSON.parse(m.parts) : m.parts;
              if (Array.isArray(parts)) content = parts.map((p: any) => p.text ?? p.content ?? "").join("");
              else content = String(parts ?? "");
            } catch {
              content = typeof m.parts === "string" ? m.parts : "";
            }
            return { id: m.id, role: m.role as "user" | "assistant", content };
          });
          setMessages(loaded);
        }
      })
      .catch((e) => {
        console.warn("Failed to load thread messages", e);
      })
      .finally(() => {
        setMessagesLoading(false);
      });
  }, [activeThreadId, getMsgsFn]);

  /* — create or get thread — */
  const ensureThread = useCallback(async (firstMessage: string): Promise<string> => {
    if (activeThreadId) return activeThreadId;
    const title = firstMessage.length > 60
      ? firstMessage.slice(0, 57) + "..."
      : firstMessage;
    try {
      const thread = await createFn({ data: { title, module: "ai-assistant" } }) as Thread;
      if (thread && thread.id) {
        setActiveThreadId(thread.id);
        qc.invalidateQueries({ queryKey: ["threads"] });
        return thread.id;
      }
    } catch (e) {
      console.warn("Failed creating thread via server function:", e);
    }
    const fallbackId = "thread-" + crypto.randomUUID();
    setActiveThreadId(fallbackId);
    return fallbackId;
  }, [activeThreadId, createFn, qc]);

  /* — send a message — */
  const handleSend = useCallback(async (text: string = input) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setInput("");

    if (inputRef.current) {
      inputRef.current.style.height = "48px";
    }

    const userMsgId = crypto.randomUUID();
    const userMsg: Message = { id: userMsgId, role: "user", content: trimmed };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsgId = crypto.randomUUID();
    streamBufferRef.current = "";
    setStreamingId(assistantMsgId);
    setStreamingContent("");
    setIsStreaming(true);
    abortRef.current = new AbortController();

    const scheduleFlush = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setStreamingContent(streamBufferRef.current);
      });
    };

    try {
      const threadId = await ensureThread(trimmed);

      // Save user message via persistent server function
      saveMsgFn({
        data: {
          id: userMsgId,
          threadId,
          role: "user",
          parts: [{ type: "text", text: trimmed }],
        },
      }).catch((e) => console.warn("Failed saving user msg", e));

      // Build conversation history for API
      const apiMessages = [...messages, userMsg].map(m => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text" as const, text: m.content }],
      }));

      // Call /api/chat (streaming)
      const demoToken = localStorage.getItem("demo_session_token");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(demoToken ? { Authorization: `Bearer ${demoToken}` } : {}),
        },
        body: JSON.stringify({ messages: apiMessages, threadId }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            if (trimmedLine.startsWith("data: ")) {
              const dataStr = trimmedLine.slice(6).trim();
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                const delta =
                  (parsed.type === "text-delta" ? (parsed.delta ?? parsed.textDelta) : null) ??
                  parsed.textDelta ??
                  parsed.text ??
                  (typeof parsed === "string" ? parsed : null);
                if (delta) {
                  streamBufferRef.current += delta;
                  scheduleFlush();
                }
              } catch {
                if (dataStr && !dataStr.startsWith("{") && dataStr !== "[DONE]") {
                  streamBufferRef.current += dataStr;
                  scheduleFlush();
                }
              }
            } else if (trimmedLine.startsWith("0:")) {
              try {
                const raw = JSON.parse(trimmedLine.slice(2));
                if (typeof raw === "string") {
                  streamBufferRef.current += raw;
                  scheduleFlush();
                } else if (raw?.textDelta || raw?.delta) {
                  streamBufferRef.current += (raw.textDelta || raw.delta);
                  scheduleFlush();
                }
              } catch {}
            }
          }
        }
      }

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      let replyContent = streamBufferRef.current;
      if (!replyContent.trim()) {
        replyContent = generateAcademicResponse(trimmed);
      }

      setMessages(prev => [
        ...prev,
        { id: assistantMsgId, role: "assistant" as const, content: replyContent },
      ]);

      setStreamingContent("");
      setStreamingId(null);

      // Save assistant message via persistent server function
      saveMsgFn({
        data: {
          id: assistantMsgId,
          threadId,
          role: "assistant",
          parts: [{ type: "text", text: replyContent }],
        },
      }).catch((e) => console.warn("Failed saving assistant msg", e));

      qc.invalidateQueries({ queryKey: ["threads"] });

    } catch (err: any) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (err?.name === "AbortError") {
        const partial = streamBufferRef.current;
        if (partial.trim()) {
          setMessages(prev => [
            ...prev,
            { id: assistantMsgId, role: "assistant" as const, content: partial },
          ]);
        }
        setStreamingContent("");
        setStreamingId(null);
        return;
      }
      console.warn("AI chat error:", err);
      const fallback = generateAcademicResponse(trimmed);
      setMessages(prev => [
        ...prev,
        { id: assistantMsgId, role: "assistant" as const, content: fallback },
      ]);
      setStreamingContent("");
      setStreamingId(null);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      streamBufferRef.current = "";
      inputRef.current?.focus();
    }
  }, [input, isStreaming, messages, ensureThread, saveMsgFn, qc]);

  /* — new chat — */
  const handleNewChat = () => {
    if (isStreaming) {
      abortRef.current?.abort();
    }
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  /* — select thread — */
  const handleSelectThread = (threadId: string) => {
    if (threadId === activeThreadId) return;
    if (isStreaming) abortRef.current?.abort();
    setActiveThreadId(threadId);
    setMenuOpenId(null);
    setSidebarOpen(false);
  };

  /* — delete thread — */
  const deleteThreadMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (id === activeThreadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
      toast.success("Chat deleted");
    },
    onError: () => toast.error("Failed to delete chat"),
  });

  /* — rename thread — */
  const handleRenameSubmit = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await renameFn({ data: { id, title: renameValue.trim() } });
      qc.invalidateQueries({ queryKey: ["threads"] });
      toast.success("Renamed");
    } catch {
      toast.error("Failed to rename");
    }
    setRenamingId(null);
  };

  /* — filter threads by search — */
  const filteredThreads = search.trim()
    ? threads.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : threads;

  const grouped = groupThreadsByDate(filteredThreads);

  /* — keyboard handler for input — */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* — auto-resize textarea — */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
  };

  /* ─────────────── Render ─────────────────────────────── */
  return (
    <ChatLayout activeThreadId={activeThreadId}>
      <div className="flex h-full overflow-hidden relative">

        {/* ── Mobile sidebar backdrop ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              className="absolute inset-0 z-30 bg-black/50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* ── Inner Left Sidebar (Chat History) ── */}
        <aside
          className={`absolute md:static inset-y-0 left-0 z-40
            w-64 shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden
            transition-transform duration-300 ease-in-out
            ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            }
          `}
        >

          {/* New Chat button */}
          <div className="p-3 border-b border-border shrink-0">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 active:scale-[.98] transition-all duration-150 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              New Chat
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search chats..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-[11px] rounded-lg border border-border bg-muted/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
              />
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
            {threadsLoading ? (
              <div className="space-y-1.5 px-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[10px] text-muted-foreground">
                  {search ? "No chats found" : "No chats yet. Start one!"}
                </p>
              </div>
            ) : (
              grouped.map(({ label, items }) => (
                <div key={label} className="mb-3">
                  <p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    {label}
                  </p>
                  {items.map(thread => (
                    <div
                      key={thread.id}
                      className={`group relative mx-2 flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-all duration-100 ${
                        thread.id === activeThreadId
                          ? "bg-foreground text-background"
                          : "hover:bg-accent text-foreground"
                      }`}
                      onClick={() => handleSelectThread(thread.id)}
                    >
                      {renamingId === thread.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => handleRenameSubmit(thread.id)}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleRenameSubmit(thread.id);
                            if (e.key === "Escape") setRenamingId(null);
                            e.stopPropagation();
                          }}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 min-w-0 bg-transparent text-[11px] font-medium outline-none border-b border-primary"
                        />
                      ) : (
                        <>
                          <MessageSquare className={`h-3 w-3 shrink-0 ${thread.id === activeThreadId ? "text-background/70" : "text-muted-foreground"}`} />
                          <span className={`flex-1 min-w-0 truncate text-[11px] font-medium leading-tight`}>
                            {thread.title}
                          </span>
                        </>
                      )}

                      {/* Context menu trigger */}
                      {renamingId !== thread.id && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === thread.id ? null : thread.id);
                          }}
                          className={`shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                            thread.id === activeThreadId ? "text-background/70 hover:text-background" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </button>
                      )}

                      {/* Dropdown menu */}
                      {menuOpenId === thread.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-50 w-36 rounded-xl border border-border bg-popover shadow-lg py-1.5 overflow-hidden">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setRenamingId(thread.id);
                                setRenameValue(thread.title);
                                setMenuOpenId(null);
                              }}
                              className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-foreground hover:bg-accent transition-colors"
                            >
                              <PencilLine className="h-3 w-3" /> Rename
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setMenuOpenId(null);
                                deleteThreadMutation.mutate(thread.id);
                              }}
                              className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── Main Chat Area ── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">

          {/* Chat header */}
          <div className="flex items-center justify-between h-12 px-3 md:px-5 border-b border-border shrink-0 bg-card/50 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              {/* Mobile sidebar toggle */}
              <button
                className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setSidebarOpen(true)}
                title="Open chat history"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground truncate">
                {activeThreadId
                  ? (threads.find(t => t.id === activeThreadId)?.title ?? "AI Study Assistant")
                  : "AI Study Assistant"}
              </span>
            </div>
            <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
              Groq · GPT-OSS 120B
            </span>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {messagesLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            ) : messages.length === 0 && !streamingContent ? (
              /* — Welcome / empty state — shown only when there are truly no messages — */
              <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
                <div className="mb-6">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-1">How can I help you today?</h2>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Ask me anything — concepts, quiz questions, flashcards, lab help, or exam prep.
                  </p>
                </div>

                {/* Template cards */}
                <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
                  {TEMPLATES.map((tmpl) => {
                    const Icon = tmpl.icon;
                    return (
                      <button
                        key={tmpl.label}
                        onClick={() => handleSend(tmpl.prompt)}
                        disabled={isStreaming}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-150 active:scale-[.98] ${tmpl.bg}`}
                      >
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tmpl.color}`} />
                        <div>
                          <p className="text-xs font-semibold text-foreground">{tmpl.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                            {tmpl.prompt}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* — Message list — always rendered once the first user message is sent — */
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}

                {/*
                  Live streaming bubble — rendered from `streamingContent` ref-state,
                  completely separate from `messages`. This eliminates the empty-bubble
                  flash: the bubble only appears once the first characters arrive.
                */}
                {streamingId && (
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    {streamingContent ? (
                      /* Live responding card using AiResponseWriter with auto-scroll and status header */
                      <div className="max-w-[85%] w-full bg-card border border-border text-foreground rounded-2xl rounded-tl-sm p-4 shadow-sm ring-1 ring-primary/10">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                          </span>
                          <span className="text-xs font-semibold text-foreground">AI is responding…</span>
                        </div>
                        <AiResponseWriter text={streamingContent} className="max-h-72" />
                      </div>
                    ) : (
                      /* No content yet → show subtle typing dots while waiting for first token */
                      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                        <div className="flex gap-1 items-center h-4">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* ── Input area ── */}
          <div className="shrink-0 border-t border-border bg-card/50 backdrop-blur-sm px-4 py-3">
            <div className="max-w-3xl mx-auto">
              <div className={`relative flex items-end gap-2 rounded-2xl border transition-all duration-150 bg-background ${
                isStreaming ? "border-primary/30" : "border-border hover:border-border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20"
              }`}>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                  placeholder="Message AI Study Assistant..."
                  className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[48px] max-h-[180px] overflow-y-auto scrollbar-thin disabled:opacity-60"
                  style={{ height: "48px" }}
                />
                <button
                  onClick={() => isStreaming ? abortRef.current?.abort() : handleSend()}
                  className={`shrink-0 mr-2 mb-2 h-8 w-8 rounded-xl flex items-center justify-center transition-all duration-150 ${
                    isStreaming
                      ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      : input.trim()
                      ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                  disabled={!input.trim() && !isStreaming}
                  title={isStreaming ? "Stop generating" : "Send message"}
                >
                  {isStreaming ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="text-center text-[9px] text-muted-foreground/50 mt-1.5">
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </main>
      </div>
    </ChatLayout>
  );
}

/* ─────────────── MessageBubble component ──────────────── */
function MessageBubble({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-primary/10 border border-primary/20"
      }`}>
        {isUser
          ? <User className="h-4 w-4" />
          : <Bot className="h-4 w-4 text-primary" />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-card border border-border text-foreground rounded-tl-sm"
      }`}>
        <MarkdownContent content={message.content} isUser={isUser} isStreaming={isStreaming} />
      </div>
    </div>
  );
}

/* ─────────────── Simple Markdown renderer ─────────────── */
function MarkdownContent({ content, isUser, isStreaming }: { content: string; isUser: boolean; isStreaming?: boolean }) {
  if (isUser) {
    return <p className="whitespace-pre-wrap leading-relaxed">{content}</p>;
  }

  // Parse markdown for assistant messages
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      elements.push(<div key={`gap-${i}`} className="h-1" />);
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-sm font-bold text-primary mt-2 mb-1 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {line.replace("### ", "")}
        </h3>
      );
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-sm font-bold text-foreground mt-2 mb-1">
          {line.replace("## ", "")}
        </h2>
      );
      i++;
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-base font-bold text-foreground mt-2 mb-1">
          {line.replace("# ", "")}
        </h1>
      );
      i++;
      continue;
    }

    if (line.startsWith("---")) {
      elements.push(<hr key={i} className="border-border my-2" />);
      i++;
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      const codeText = codeLines.join("\n");

      // For JSON blocks: try to render nicely as a collapsible summary
      // rather than a raw code dump — avoids the "json at the bottom" UX issue.
      if (lang === "json") {
        let parsed: Record<string, unknown> | null = null;
        try { parsed = JSON.parse(codeText); } catch { /* keep null */ }

        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          elements.push(
            <div key={`json-${i}`} className="my-2 rounded-xl overflow-hidden border border-border">
              <div className="bg-muted/60 px-3 py-1.5 text-[9px] font-mono text-muted-foreground border-b border-border flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Structured Data
              </div>
              <div className="bg-muted/20 px-4 py-3 space-y-1">
                {Object.entries(parsed).map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2 text-[11px]">
                    <span className="font-mono text-primary/80 shrink-0">{k}:</span>
                    <span className="text-foreground font-medium">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        } else {
          // Fallback: regular code block for non-object JSON (arrays etc.)
          elements.push(
            <div key={`code-${i}`} className="my-2 rounded-xl overflow-hidden border border-border">
              <div className="bg-muted px-3 py-1 text-[9px] font-mono text-muted-foreground border-b border-border">json</div>
              <pre className="bg-muted/50 px-4 py-3 overflow-x-auto scrollbar-thin text-[11px] font-mono text-foreground">
                <code>{codeText}</code>
              </pre>
            </div>
          );
        }
      } else {
        // Non-JSON code block — render normally
        elements.push(
          <div key={`code-${i}`} className="my-2 rounded-xl overflow-hidden border border-border">
            {lang && (
              <div className="bg-muted px-3 py-1 text-[9px] font-mono text-muted-foreground border-b border-border">
                {lang}
              </div>
            )}
            <pre className="bg-muted/50 px-4 py-3 overflow-x-auto scrollbar-thin text-[11px] font-mono text-foreground">
              <code>{codeText}</code>
            </pre>
          </div>
        );
      }
      i++;
      continue;
    }

    // Bullet list
    if (line.match(/^[\*\-]\s/) || line.match(/^\d+\.\s/)) {
      const listItems: string[] = [];
      const isOrdered = line.match(/^\d+\.\s/);
      while (i < lines.length && (lines[i].match(/^[\*\-]\s/) || lines[i].match(/^\d+\.\s/))) {
        const itemText = lines[i].replace(/^[\*\-]\s+/, "").replace(/^\d+\.\s+/, "");
        listItems.push(itemText);
        i++;
      }
      elements.push(
        isOrdered ? (
          <ol key={`list-${i}`} className="my-1.5 space-y-1 list-decimal list-inside">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-[13px] leading-relaxed text-foreground">
                <InlineMarkdown text={item} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={`list-${i}`} className="my-1.5 space-y-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[13px] leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span><InlineMarkdown text={item} /></span>
              </li>
            ))}
          </ul>
        )
      );
      continue;
    }

    // Table
    if (line.startsWith("|")) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!lines[i].includes("---")) {
          const cells = lines[i].split("|").filter(Boolean).map(c => c.trim());
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        elements.push(
          <div key={`table-${i}`} className="my-2 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/60">
                <tr>
                  {tableRows[0].map((cell, ci) => (
                    <th key={ci} className="px-3 py-2 text-left font-bold text-foreground border-b border-border">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-muted-foreground border-b border-border/40">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-[13px] leading-relaxed text-foreground">
        <InlineMarkdown text={line} />
      </p>
    );
    i++;
  }

  return (
    <div className="space-y-0.5">
      {elements}
      {isStreaming && (
        <span
          className="inline-block w-[2px] h-[1em] bg-primary ml-0.5 align-middle"
          style={{ animation: "caretBlink 0.9s step-end infinite" }}
        />
      )}
      <style>{`@keyframes caretBlink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}

/* ─────────────── Inline markdown (bold, italic, code) ─── */
function InlineMarkdown({ text }: { text: string }) {
  // Parse **bold**, *italic*, `code`, and plain text
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={key++} className="italic">{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono text-primary border border-border/60">
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}
