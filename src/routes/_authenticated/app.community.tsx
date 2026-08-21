import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, MessageSquare, Heart, Plus, Search, Circle, Send, X,
  CheckCheck, MessageCircle, RefreshCw, UserCheck, UserPlus, Hash,
  UsersRound, Loader2, Trash2, Lock, Globe, ArrowLeft,
  MessageSquarePlus
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/community")({
  component: CommunityPage,
});

/* ─────────────────────────── Types ─────────────────────────── */

interface CommunityPost {
  id: string;
  user_id: string;
  author_name: string;
  author_initials: string;
  author_role?: string;
  content: string;
  likes: number;
  created_at: string;
  likedByMe?: boolean;
}

interface ClassmateMember {
  id: string;
  name: string;
  initials: string;
  department: string;
  activity: string;
  status: "online" | "offline";
}

interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

interface Group {
  id: string;
  name: string;
  description: string;
  created_by: string;
  memberCount?: number;
  isMember?: boolean;
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function getInitials(name: string): string {
  if (!name) return "ST";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Minimalist, monochromatic monogram styling avoiding all loud/rainbow gradients.
 */
function avatarColor(initials: string): string {
  const styles = [
    "bg-zinc-800 text-zinc-100 border border-zinc-700/60 dark:bg-zinc-800 dark:text-zinc-100",
    "bg-zinc-700 text-zinc-100 border border-zinc-600/60 dark:bg-zinc-900 dark:text-zinc-200",
    "bg-neutral-800 text-neutral-100 border border-neutral-700/60",
    "bg-stone-800 text-stone-100 border border-stone-700/60",
    "bg-slate-800 text-slate-100 border border-slate-700/60",
    "bg-zinc-900 text-zinc-100 border border-zinc-700/80",
  ];
  const code = initials ? initials.charCodeAt(0) + (initials.charCodeAt(1) || 0) : 0;
  return styles[code % styles.length];
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dataChanged(prev: DirectMessage[], next: DirectMessage[]): boolean {
  if (prev.length !== next.length) return true;
  if (prev.length > 0 && next.length > 0) {
    if (prev[prev.length - 1].id !== next[next.length - 1].id) return true;
  }
  return false;
}

/* ─────────────────────────── Component ─────────────────────────── */

type MainTab = "global" | "dms";
type RightPanel = "members" | "groups";

function CommunityPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);

  /* Main Navigation Mode: Global Community vs Direct Messages */
  const [mainTab, setMainTab] = useState<MainTab>("dms");

  /* Posts */
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [newPostText, setNewPostText] = useState("");
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  /* Classmates presence */
  const [members, setMembers] = useState<ClassmateMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [memberFilter, setMemberFilter] = useState<"all" | "online" | "offline">("all");
  const [memberSearch, setMemberSearch] = useState("");

  /* Right panel in Global mode */
  const [rightPanel, setRightPanel] = useState<RightPanel>("members");

  /* Groups */
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [groupSubmitting, setGroupSubmitting] = useState(false);

  /* Direct Messages */
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [dmSending, setDmSending] = useState(false);

  /* Active DM Conversation Peer IDs & Recent Message Details + Unread Counts */
  const [activePeerIds, setActivePeerIds] = useState<string[]>([]);
  const [recentDmMap, setRecentDmMap] = useState<Record<string, { lastMessage: string; lastMessageAt: string; unreadCount: number }>>({});
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");

  /* Refs for latest state in realtime callbacks */
  const chatEndRef = useRef<HTMLDivElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const activePeerIdRef = useRef<string | null>(null);
  useEffect(() => { activePeerIdRef.current = activePeerId; }, [activePeerId]);

  const mainTabRef = useRef<MainTab>("dms");
  useEffect(() => { mainTabRef.current = mainTab; }, [mainTab]);

  /* ── Bootstrap: get current user ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });
  }, []);

  /* ── Fetch ALL classmate profiles via DB function ── */
  const fetchProfiles = async () => {
    setMembersLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_all_students");
      if (error) { console.error("Error fetching students:", error); return; }
      if (data) {
        const mapped: ClassmateMember[] = data.map((p: any) => ({
          id: p.id,
          name: p.full_name || p.email?.split("@")[0] || "Student",
          initials: getInitials(p.full_name || p.email?.split("@")[0] || "ST"),
          department: p.degree || "MSc Big Data Analytics",
          activity: p.target_role ? `Goal: ${p.target_role}` : "Active Student",
          status: "offline" as const,
        }));
        setMembers(mapped);
      }
    } catch (err) {
      console.error("Failed to load students:", err);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => { if (currentUser) fetchProfiles(); }, [currentUser?.id]);

  /* ── Realtime Presence ── */
  useEffect(() => {
    if (!currentUser?.id) return;
    const room = supabase.channel("community-presence", {
      config: { presence: { key: currentUser.id } },
    });
    const syncPresence = () => {
      const state = room.presenceState();
      const onlineSet = new Set<string>();
      Object.keys(state).forEach((key) => {
        onlineSet.add(key);
        const presences = state[key] as any[];
        presences?.forEach((p) => { if (p.user_id) onlineSet.add(p.user_id); });
      });
      setOnlineUserIds(onlineSet);
    };
    room
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await room.track({ user_id: currentUser.id, online_at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(room); };
  }, [currentUser?.id]);

  /* ── Fetch all recent DM conversations for logged-in user ── */
  const fetchRecentConversations = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      let { data: dms, error: dmError } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order("created_at", { ascending: false });

      if (dmError || !dms || dms.length === 0) {
        const { data: pms } = await supabase
          .from("private_messages")
          .select("*")
          .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
          .order("created_at", { ascending: false });
        dms = pms || [];
      }

      const convMap: Record<string, { lastMessage: string; lastMessageAt: string; unreadCount: number }> = {};
      const peerOrder: string[] = [];

      const getReadTime = (peerId: string): number => {
        const val = localStorage.getItem(`acadsphere_dm_read_${currentUser.id}_${peerId}`);
        return val ? new Date(val).getTime() : 0;
      };

      for (const msg of dms || []) {
        const peerId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
        if (!peerOrder.includes(peerId)) peerOrder.push(peerId);

        if (!convMap[peerId]) {
          convMap[peerId] = {
            lastMessage: msg.content,
            lastMessageAt: msg.created_at,
            unreadCount: 0,
          };
        }

        const isIncoming = msg.receiver_id === currentUser.id;
        const readTime = getReadTime(peerId);
        const msgTime = new Date(msg.created_at).getTime();

        if (isIncoming && msgTime > readTime && (activePeerIdRef.current !== peerId || mainTabRef.current !== "dms")) {
          convMap[peerId].unreadCount += 1;
        }
      }

      setRecentDmMap(convMap);
      setActivePeerIds(peerOrder);

      // Auto-select first active peer if none selected and on desktop
      if (!activePeerIdRef.current && peerOrder.length > 0) {
        setActivePeerId(peerOrder[0]);
      }
    } catch (err) {
      console.error("Failed to load recent DM conversations:", err);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) fetchRecentConversations();
  }, [currentUser?.id, fetchRecentConversations]);

  /* ── Open Chat with a Peer & Mark as Read ── */
  const openChatWithPeer = (peerId: string) => {
    setActivePeerId(peerId);
    setMainTab("dms");
    setActivePeerIds((prev) => [peerId, ...prev.filter((id) => id !== peerId)]);

    if (currentUser?.id) {
      const nowStr = new Date().toISOString();
      localStorage.setItem(`acadsphere_dm_read_${currentUser.id}_${peerId}`, nowStr);
      setRecentDmMap((prev) => ({
        ...prev,
        [peerId]: {
          ...(prev[peerId] || { lastMessage: "", lastMessageAt: nowStr }),
          unreadCount: 0,
        },
      }));
    }
  };

  /* ── Fetch community posts ── */
  const fetchPosts = useCallback(async (uid?: string) => {
    setPostsLoading(true);
    try {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const userId = uid || currentUser?.id;
      let likedPostIds = new Set<string>();
      if (userId) {
        const { data: likeData } = await supabase
          .from("community_post_likes").select("post_id").eq("user_id", userId);
        if (likeData) likedPostIds = new Set(likeData.map((l: any) => l.post_id));
      }
      const mapped: CommunityPost[] = (data || []).map((p: any) => ({
        id: p.id, user_id: p.user_id,
        author_name: p.author_name || "", author_initials: p.author_initials || "",
        author_role: p.author_role || "student",
        content: p.content, likes: p.likes || 0, created_at: p.created_at,
        likedByMe: likedPostIds.has(p.id),
      }));
      setPosts(mapped);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
      toast.error("Could not refresh posts");
    } finally {
      setPostsLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => { if (currentUser?.id) fetchPosts(currentUser.id); }, [currentUser?.id]);

  /* ── Realtime: community posts ── */
  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel("community-posts-realtime-v7")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_posts" },
        (payload) => {
          const p = payload.new as any;
          const newPost: CommunityPost = {
            id: p.id, user_id: p.user_id, author_name: p.author_name || "",
            author_initials: p.author_initials || "", author_role: p.author_role || "student",
            content: p.content,
            likes: p.likes || 0, created_at: p.created_at, likedByMe: false,
          };
          setPosts((prev) => {
            if (prev.some((x) => x.id === newPost.id)) return prev;
            return [...prev, newPost];
          });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "community_posts" },
        (payload) => {
          const p = payload.new as any;
          setPosts((prev) => prev.map((post) =>
            post.id === p.id ? { ...post, likes: p.likes ?? post.likes, content: p.content ?? post.content } : post
          ));
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "community_posts" },
        (payload) => {
          const p = payload.old as any;
          setPosts((prev) => prev.filter((post) => post.id !== p.id));
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_post_likes" },
        (payload) => {
          const p = payload.new as any;
          setPosts((prev) => prev.map((post) =>
            post.id === p.post_id ? { ...post, likes: post.likes + 1, likedByMe: p.user_id === currentUser.id ? true : post.likedByMe } : post
          ));
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "community_post_likes" },
        (payload) => {
          const p = payload.old as any;
          setPosts((prev) => prev.map((post) =>
            post.id === p.post_id ? { ...post, likes: Math.max(0, post.likes - 1), likedByMe: p.user_id === currentUser.id ? false : post.likedByMe } : post
          ));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  /* ── Fetch DM conversation messages for active peer ── */
  const fetchDMs = useCallback(async (peerId: string) => {
    if (!currentUser?.id) return;
    setDmLoading(true);
    try {
      let { data: dmData, error: dmError } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${currentUser.id})`)
        .order("created_at", { ascending: true });

      if (!dmError && dmData && dmData.length > 0) {
        setDmMessages(dmData);
        return;
      }

      const { data: pmData, error: pmError } = await supabase
        .from("private_messages")
        .select("*")
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${currentUser.id})`)
        .order("created_at", { ascending: true });

      if (!pmError && pmData) {
        setDmMessages(pmData);
        return;
      }

      setDmMessages(dmData || []);
    } catch (err) {
      console.error("Failed to load DMs:", err);
      toast.error("Could not load direct messages");
    } finally {
      setDmLoading(false);
    }
  }, [currentUser?.id]);

  /* ── Load DMs when active peer changes & mark as read ── */
  useEffect(() => {
    if (activePeerId && currentUser?.id) {
      fetchDMs(activePeerId);
      const nowStr = new Date().toISOString();
      localStorage.setItem(`acadsphere_dm_read_${currentUser.id}_${activePeerId}`, nowStr);
      setRecentDmMap((prev) => ({
        ...prev,
        [activePeerId]: {
          ...(prev[activePeerId] || { lastMessage: "", lastMessageAt: nowStr }),
          unreadCount: 0,
        },
      }));
    } else {
      setDmMessages([]);
    }
  }, [activePeerId, currentUser?.id, fetchDMs]);

  /* ── Triple-redundant Realtime Engine: Broadcast + postgres_changes ── */
  useEffect(() => {
    if (!currentUser?.id) return;

    const handleNewMessage = (msg: DirectMessage) => {
      const peerId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;

      setActivePeerIds((prev) => [peerId, ...prev.filter((id) => id !== peerId)]);

      const isIncoming = msg.receiver_id === currentUser.id;
      const isCurrentChatOpen = activePeerIdRef.current === peerId;

      if (isCurrentChatOpen) {
        setDmMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        localStorage.setItem(`acadsphere_dm_read_${currentUser.id}_${peerId}`, new Date().toISOString());
      }

      setRecentDmMap((prev) => {
        const currentUnread = prev[peerId]?.unreadCount || 0;
        const newUnread = isIncoming && !isCurrentChatOpen ? currentUnread + 1 : 0;
        return {
          ...prev,
          [peerId]: {
            lastMessage: msg.content,
            lastMessageAt: msg.created_at,
            unreadCount: newUnread,
          },
        };
      });

      if (isIncoming && !isCurrentChatOpen) {
        const senderName = members.find((m) => m.id === msg.sender_id)?.name || "Classmate";
        toast.info(`Message from ${senderName}`, {
          description: msg.content.slice(0, 45) + (msg.content.length > 45 ? "..." : ""),
          action: {
            label: "Open Chat",
            onClick: () => openChatWithPeer(msg.sender_id),
          },
        });
      }
    };

    const myChannel = supabase.channel(`dm-peer-${currentUser.id}`);
    myChannel
      .on("broadcast", { event: "new_dm_message" }, (payload) => {
        if (payload?.payload) {
          handleNewMessage(payload.payload as DirectMessage);
        }
      })
      .subscribe();

    const dbChannel = supabase
      .channel("custom-dm-channel-v7")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => handleNewMessage(payload.new as DirectMessage)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages" },
        (payload) => handleNewMessage(payload.new as DirectMessage)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "direct_messages" },
        (payload) => {
          const p = payload.old as any;
          setDmMessages((prev) => prev.filter((m) => m.id !== p.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(myChannel);
      supabase.removeChannel(dbChannel);
    };
  }, [currentUser?.id, members]);

  /* ── 2.5s Polling Fallback for active DM chat ── */
  useEffect(() => {
    if (!activePeerId || !currentUser?.id) return;

    const fetchNewestDMs = async () => {
      try {
        let { data: dmData } = await supabase
          .from("direct_messages")
          .select("*")
          .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activePeerId}),and(sender_id.eq.${activePeerId},receiver_id.eq.${currentUser.id})`)
          .order("created_at", { ascending: true });

        if (!dmData || dmData.length === 0) {
          const { data: pmData } = await supabase
            .from("private_messages")
            .select("*")
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activePeerId}),and(sender_id.eq.${activePeerId},receiver_id.eq.${currentUser.id})`)
            .order("created_at", { ascending: true });
          dmData = pmData;
        }

        if (dmData && dmData.length > 0) {
          setDmMessages((prev) => {
            if (dataChanged(prev, dmData)) {
              return dmData;
            }
            return prev;
          });

          const lastMsg = dmData[dmData.length - 1];
          setRecentDmMap((prev) => ({
            ...prev,
            [activePeerId]: {
              lastMessage: lastMsg.content,
              lastMessageAt: lastMsg.created_at,
              unreadCount: 0,
            },
          }));
        }
      } catch (_) {}
    };

    const interval = setInterval(fetchNewestDMs, 2500);
    return () => clearInterval(interval);
  }, [activePeerId, currentUser?.id]);

  /* ── Fetch groups ── */
  const fetchGroups = async () => {
    if (!currentUser?.id) return;
    setGroupsLoading(true);
    try {
      const { data: groupData, error } = await supabase
        .from("community_groups").select("*, community_group_members(user_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const mapped: Group[] = (groupData || []).map((g: any) => ({
        id: g.id, name: g.name, description: g.description || "", created_by: g.created_by,
        memberCount: g.community_group_members?.length || 0,
        isMember: g.community_group_members?.some((m: any) => m.user_id === currentUser?.id),
      }));
      setGroups(mapped);
    } catch (err) { console.error("Failed to load groups:", err); }
    finally { setGroupsLoading(false); }
  };

  useEffect(() => { if (currentUser?.id && rightPanel === "groups") fetchGroups(); }, [currentUser?.id, rightPanel]);

  /* ── Auto-scroll ── */
  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [posts.length]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [dmMessages.length, activePeerId]);

  /* ── Derived data ── */
  const membersWithPresence = useMemo(() =>
    members.map((m) => ({ ...m, status: onlineUserIds.has(m.id) ? ("online" as const) : ("offline" as const) })),
    [members, onlineUserIds]
  );

  const onlineMembersCount = useMemo(() => {
    const classOnline = membersWithPresence.filter((m) => m.status === "online").length;
    return Math.max(onlineUserIds.size, classOnline);
  }, [membersWithPresence, onlineUserIds]);

  /* FILTER 1: Active DM conversation peers */
  const conversationMembers = useMemo(() => {
    const activeSet = new Set(activePeerIds);
    const list = membersWithPresence.filter((m) => m.id !== currentUser?.id && activeSet.has(m.id));

    return list.sort((a, b) => {
      const idxA = activePeerIds.indexOf(a.id);
      const idxB = activePeerIds.indexOf(b.id);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  }, [membersWithPresence, activePeerIds, currentUser]);

  const filteredConversationMembers = useMemo(() => {
    if (!memberSearch.trim()) return conversationMembers;
    const q = memberSearch.toLowerCase();
    return conversationMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.department.toLowerCase().includes(q) ||
        (recentDmMap[m.id]?.lastMessage || "").toLowerCase().includes(q)
    );
  }, [conversationMembers, memberSearch, recentDmMap]);

  /* FILTER 2: Members for Global Community Right Sidebar (all classmates) */
  const filteredMembers = useMemo(() => {
    const result = membersWithPresence.filter((m) => {
      if (memberFilter === "online" && m.status !== "online") return false;
      if (memberFilter === "offline" && m.status !== "offline") return false;
      if (memberSearch.trim()) {
        const q = memberSearch.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.department.toLowerCase().includes(q);
      }
      return true;
    });
    return result.sort((a, b) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      return a.status === "online" ? -1 : 1;
    });
  }, [membersWithPresence, memberFilter, memberSearch]);

  /* FILTER 3: All classmates list for + New Chat Modal */
  const allClassmatesForNewChat = useMemo(() => {
    const list = membersWithPresence.filter((m) => m.id !== currentUser?.id);
    if (!newChatSearch.trim()) return list;
    const q = newChatSearch.toLowerCase();
    return list.filter((m) => m.name.toLowerCase().includes(q) || m.department.toLowerCase().includes(q));
  }, [membersWithPresence, newChatSearch, currentUser]);

  /* Total Unread DM Count across all conversations */
  const totalUnreadCount = useMemo(() => {
    return Object.values(recentDmMap).reduce((sum, item) => sum + (item.unreadCount || 0), 0);
  }, [recentDmMap]);

  const filteredPosts = useMemo(() => {
    if (!search.trim()) return posts;
    const q = search.toLowerCase();
    return posts.filter((p) => p.content.toLowerCase().includes(q) || p.author_name.toLowerCase().includes(q));
  }, [posts, search]);

  const activePeer = useMemo(() =>
    activePeerId ? membersWithPresence.find((m) => m.id === activePeerId) || null : null,
    [membersWithPresence, activePeerId]
  );

  /* ── Actions ── */
  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostText.trim() || !currentUser) return;
    setPostSubmitting(true);
    const authorName = currentUser.user_metadata?.full_name || currentUser.email?.split("@")[0] || "Student";
    const authorRole = (typeof window !== "undefined" && localStorage.getItem("demo_user_role")) || "student";
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticPost: CommunityPost = {
      id: optimisticId, user_id: currentUser.id, author_name: authorName,
      author_initials: getInitials(authorName), author_role: authorRole, content: newPostText.trim(),
      likes: 0, created_at: new Date().toISOString(), likedByMe: false,
    };
    setPosts((prev) => [...prev, optimisticPost]);
    setNewPostText("");
    try {
      const { data, error } = await supabase.from("community_posts").insert({
        user_id: currentUser.id, author_name: authorName,
        author_initials: getInitials(authorName), author_role: authorRole, content: optimisticPost.content, likes: 0,
      }).select().single();
      if (error) throw error;
      setPosts((prev) => prev.map((p) => (p.id === optimisticId ? { ...optimisticPost, id: data.id, created_at: data.created_at } : p)));
      toast.success("Discussion published");
    } catch (err: any) {
      setPosts((prev) => prev.filter((p) => p.id !== optimisticId));
      toast.error("Failed to post: " + (err.message || "Unknown error"));
    } finally { setPostSubmitting(false); }
  };

  const handleDeletePost = async (postId: string) => {
    if (!currentUser) return;
    try {
      const { error } = await supabase.from("community_posts").delete().eq("id", postId).eq("user_id", currentUser.id);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Discussion removed");
    } catch (err: any) {
      toast.error("Could not delete discussion: " + (err.message || ""));
    }
  };

  const handleLike = async (post: CommunityPost) => {
    if (!currentUser) return;
    try {
      if (post.likedByMe) {
        await supabase.from("community_post_likes").delete().eq("post_id", post.id).eq("user_id", currentUser.id);
        await supabase.from("community_posts").update({ likes: Math.max(0, post.likes - 1) }).eq("id", post.id);
      } else {
        await supabase.from("community_post_likes").insert({ post_id: post.id, user_id: currentUser.id });
        await supabase.from("community_posts").update({ likes: post.likes + 1 }).eq("id", post.id);
      }
    } catch (err) { console.error("Like error:", err); }
  };

  /* Send DM to direct_messages table & broadcast to recipient's WebSocket channel */
  const handleSendDM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activePeerId || !currentUser) return;
    setDmSending(true);
    const content = chatInput.trim();
    setChatInput("");
    const nowIso = new Date().toISOString();

    const optimisticMsg: DirectMessage = {
      id: `opt-${Date.now()}`, sender_id: currentUser.id,
      receiver_id: activePeerId, content, created_at: nowIso,
    };
    setDmMessages((prev) => [...prev, optimisticMsg]);

    setRecentDmMap((prev) => ({
      ...prev,
      [activePeerId]: {
        lastMessage: content,
        lastMessageAt: nowIso,
        unreadCount: 0,
      },
    }));

    try {
      let insertedMsg: DirectMessage | null = null;
      const { data, error } = await supabase.from("direct_messages").insert({
        sender_id: currentUser.id, receiver_id: activePeerId, content,
      }).select().single();

      if (error) {
        const { data: pmData, error: pmError } = await supabase.from("private_messages").insert({
          sender_id: currentUser.id, receiver_id: activePeerId, content,
        }).select().single();
        if (pmError) throw error;
        insertedMsg = pmData;
      } else {
        insertedMsg = data;
      }

      if (insertedMsg) {
        setDmMessages((prev) => prev.map((m) => (m.id === optimisticMsg.id ? insertedMsg! : m)));

        const recipientChannel = supabase.channel(`dm-peer-${activePeerId}`);
        recipientChannel.send({
          type: "broadcast",
          event: "new_dm_message",
          payload: insertedMsg,
        });
      }
    } catch (err: any) {
      setDmMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setChatInput(content);
      toast.error("Failed to send message: " + (err.message || ""));
    } finally { setDmSending(false); }
  };

  const handleDeleteDM = async (msgId: string) => {
    try {
      await supabase.from("direct_messages").delete().eq("id", msgId).eq("sender_id", currentUser.id);
      await supabase.from("private_messages").delete().eq("id", msgId).eq("sender_id", currentUser.id);
      setDmMessages((prev) => prev.filter((m) => m.id !== msgId));
      toast.success("Message removed");
    } catch {
      toast.error("Could not delete message");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !currentUser) return;
    setGroupSubmitting(true);
    try {
      const { data, error } = await supabase.from("community_groups").insert({
        name: newGroupName.trim(), description: newGroupDesc.trim(), created_by: currentUser.id,
      }).select().single();
      if (error) throw error;
      await supabase.from("community_group_members").insert({ group_id: data.id, user_id: currentUser.id });
      toast.success(`Group "${newGroupName}" created`);
      setNewGroupName(""); setNewGroupDesc(""); setShowCreateGroup(false);
      fetchGroups();
    } catch (err: any) { toast.error("Failed to create group: " + (err.message || "")); }
    finally { setGroupSubmitting(false); }
  };

  const handleJoinGroup = async (groupId: string, isMember: boolean) => {
    if (!currentUser) return;
    try {
      if (isMember) {
        await supabase.from("community_group_members").delete().eq("group_id", groupId).eq("user_id", currentUser.id);
        toast.success("Left group");
      } else {
        await supabase.from("community_group_members").insert({ group_id: groupId, user_id: currentUser.id });
        toast.success("Joined group");
      }
      fetchGroups();
    } catch (err: any) { toast.error(err.message || "Error updating group membership"); }
  };

  /* ─────────────────────────── Render ─────────────────────────── */

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full bg-background text-foreground flex flex-col transition-colors duration-200 overflow-hidden relative">

        {/* ── Top Header Navigation ── */}
        <header className="px-5 py-3.5 border-b border-border/80 bg-card/60 backdrop-blur-md shrink-0 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl border border-border/80 bg-muted/60 flex items-center justify-center text-foreground shrink-0 shadow-xs">
              <Users className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-foreground">Community & Messages</h1>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50">
                  Academic Net
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Classroom discussions & direct peer collaboration
              </p>
            </div>
          </div>

          {/* Central Segmented Control: DMs vs Discussions */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/80 shadow-xs">
              <button
                onClick={() => setMainTab("dms")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  mainTab === "dms"
                    ? "bg-background text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>Direct Messages</span>
                {totalUnreadCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-primary text-primary-foreground">
                    {totalUnreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setMainTab("global")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  mainTab === "global"
                    ? "bg-background text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Discussion Feed</span>
              </button>
            </div>

            {/* Online Pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border/60 text-[11px] font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{onlineMembersCount} active</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchProfiles();
                fetchPosts(currentUser?.id);
                fetchRecentConversations();
                if (activePeerId) fetchDMs(activePeerId);
              }}
              className="h-8 text-xs px-2.5 rounded-lg border-border/80 hover:bg-accent"
              title="Sync latest data"
            >
              <RefreshCw className={`h-3 w-3 ${membersLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </header>

        {/* ════════════════════════════════════════════════════════════════════
            MODE 1: DIRECT MESSAGES (DUAL PANE MESSENGER)
        ════════════════════════════════════════════════════════════════════ */}
        {mainTab === "dms" && (
          <div className="flex-1 flex overflow-hidden bg-background">

            {/* Left Conversation Sidebar */}
            <aside className={`w-full md:w-80 lg:w-88 border-r border-border/80 bg-card/40 flex flex-col shrink-0 overflow-hidden ${
              activePeerId ? "hidden md:flex" : "flex"
            }`}>
              {/* Header & Search */}
              <div className="p-3 border-b border-border/60 space-y-2.5 bg-card/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Chats
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                      {conversationMembers.length}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => setShowNewChatModal(true)}
                    className="h-7 text-xs font-medium px-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-lg shadow-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    New Chat
                  </Button>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 text-xs bg-muted/50 border border-border/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground transition-all"
                  />
                </div>
              </div>

              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                {membersLoading ? (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-14 bg-muted/40 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : filteredConversationMembers.length === 0 ? (
                  <div className="text-center p-6 border border-dashed border-border/80 rounded-2xl my-6 mx-2 space-y-3 bg-muted/10">
                    <div className="h-10 w-10 rounded-xl bg-muted border border-border/80 flex items-center justify-center mx-auto text-muted-foreground">
                      <MessageSquarePlus className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">No active conversations</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Start a direct chat with any student from your course.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setShowNewChatModal(true)}
                      className="h-8 text-xs font-medium px-3 bg-foreground text-background hover:bg-foreground/90 rounded-lg"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Browse Classmates
                    </Button>
                  </div>
                ) : (
                  filteredConversationMembers.map((member) => {
                    const isActive = activePeerId === member.id;
                    const dmMeta = recentDmMap[member.id];
                    const unread = dmMeta?.unreadCount || 0;
                    const lastMsg = dmMeta?.lastMessage || "";
                    const timeStr = dmMeta?.lastMessageAt ? fmtTime(dmMeta.lastMessageAt) : "";

                    return (
                      <button
                        key={member.id}
                        onClick={() => openChatWithPeer(member.id)}
                        className={`w-full text-left flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-150 relative ${
                          isActive
                            ? "bg-accent/80 border-border shadow-xs"
                            : "border-transparent hover:bg-muted/40 hover:border-border/40"
                        }`}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold ${avatarColor(member.initials)}`}>
                            {member.initials}
                          </div>
                          {member.status === "online" && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {member.name}
                            </span>
                            {timeStr && (
                              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                {timeStr}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className={`text-[11px] truncate ${unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                              {lastMsg || member.department}
                            </p>
                            {unread > 0 && (
                              <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-primary text-primary-foreground">
                                {unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Right Chat Conversation Area */}
            <main className={`flex-1 flex flex-col bg-background/50 overflow-hidden ${
              !activePeerId ? "hidden md:flex" : "flex"
            }`}>
              {activePeer ? (
                <>
                  {/* Chat Top Bar */}
                  <div className="px-4 py-3 border-b border-border/80 bg-card/60 backdrop-blur-md flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Mobile Back Button */}
                      <button
                        onClick={() => setActivePeerId(null)}
                        className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Back to conversation list"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>

                      <div className="relative">
                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold ${avatarColor(activePeer.initials)}`}>
                          {activePeer.initials}
                        </div>
                        {activePeer.status === "online" && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xs font-semibold text-foreground leading-none">{activePeer.name}</h2>
                          <span className="text-[10px] font-mono text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground truncate">{activePeer.department}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                          <Lock className="h-2.5 w-2.5 text-muted-foreground/70" />
                          <span>End-to-end peer message</span>
                          <span>·</span>
                          <span className={activePeer.status === "online" ? "text-emerald-500 font-medium" : "text-muted-foreground"}>
                            {activePeer.status === "online" ? "Online" : "Offline"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Message History Feed */}
                  <div className="flex-1 p-4 overflow-y-auto scrollbar-thin space-y-3 bg-muted/10">
                    {dmLoading ? (
                      <div className="h-full flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : dmMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 max-w-sm mx-auto">
                        <div className="h-11 w-11 rounded-2xl bg-muted border border-border flex items-center justify-center text-muted-foreground mb-1">
                          <MessageCircle className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          Direct message with {activePeer.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Collaborate on academic coursework, share study materials, or sync on project tasks.
                        </p>
                      </div>
                    ) : (
                      dmMessages.map((msg) => {
                        const isMe = msg.sender_id === currentUser?.id;
                        return (
                          <div key={msg.id} className={`flex flex-col group ${isMe ? "items-end" : "items-start"}`}>
                            <div className={`flex items-end gap-1.5 ${isMe ? "flex-row-reverse" : "flex-row"} max-w-[85%] md:max-w-[70%]`}>
                              <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed break-words whitespace-pre-wrap ${
                                isMe
                                  ? "bg-foreground text-background font-medium rounded-tr-xs shadow-xs"
                                  : "bg-card border border-border/80 text-foreground rounded-tl-xs shadow-xs"
                              }`}>
                                {msg.content}
                              </div>

                              {isMe && (
                                <button
                                  onClick={() => handleDeleteDM(msg.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-muted mb-0.5 shrink-0"
                                  title="Delete message"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>

                            <span className="text-[9px] text-muted-foreground mt-1 px-1 flex items-center gap-1 font-mono">
                              {fmtTime(msg.created_at)}
                              {isMe && <CheckCheck className="h-3 w-3 text-muted-foreground inline" />}
                            </span>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Message Input Box */}
                  <form onSubmit={handleSendDM} className="p-3 bg-card/60 border-t border-border/80 backdrop-blur-md flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Message ${activePeer.name}...`}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 h-10 px-4 text-xs bg-muted/40 border border-border/80 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground transition-all"
                      autoFocus
                    />
                    <Button
                      type="submit"
                      disabled={!chatInput.trim() || dmSending}
                      className="h-10 px-4 bg-foreground text-background hover:bg-foreground/90 font-medium text-xs rounded-xl shadow-xs gap-1.5 transition-all active:scale-98"
                    >
                      {dmSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5" /> Send</>}
                    </Button>
                  </form>
                </>
              ) : (
                /* Empty Chat Prompt */
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <div className="h-12 w-12 rounded-2xl bg-muted border border-border flex items-center justify-center text-muted-foreground">
                    <MessageSquarePlus className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Your Direct Messages</h2>
                    <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
                      Select a conversation on the left, or click "New Chat" to connect with any classmate.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowNewChatModal(true)}
                    className="h-8 text-xs font-medium px-4 bg-foreground text-background hover:bg-foreground/90 rounded-lg shadow-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Start New Chat
                  </Button>
                </div>
              )}
            </main>

          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODE 2: DISCUSSION FORUM (GLOBAL ACADEMIC FEED)
        ════════════════════════════════════════════════════════════════════ */}
        {mainTab === "global" && (
          <div className="flex-1 flex overflow-hidden bg-background">

            {/* Central Feed */}
            <main className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto scrollbar-thin max-w-4xl mx-auto w-full">

              {/* Discussion Composer */}
              <Card className="border-border/80 bg-card/70 shadow-xs rounded-2xl overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <form onSubmit={handlePost} className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${avatarColor(getInitials(currentUser?.user_metadata?.full_name || "You"))}`}>
                        {getInitials(currentUser?.user_metadata?.full_name || currentUser?.email?.split("@")[0] || "You")}
                      </div>
                      <Textarea
                        placeholder="Share a resource, ask a question, or start a study discussion with your batch..."
                        value={newPostText}
                        onChange={(e) => setNewPostText(e.target.value)}
                        className="flex-1 min-h-[72px] text-xs bg-muted/40 border-border/80 resize-none focus:ring-1 focus:ring-primary rounded-xl placeholder:text-muted-foreground"
                        required
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="px-2 py-0.5 rounded-md bg-muted border border-border/50 font-mono">#general</span>
                        <span>Public to course students</span>
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={postSubmitting || !newPostText.trim()}
                        className="h-8 px-4 bg-foreground text-background hover:bg-foreground/90 font-medium text-xs rounded-xl shadow-xs transition-all active:scale-98"
                      >
                        {postSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3 w-3 mr-1.5" /> Post Discussion</>}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter discussions by topic, question, or author..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 text-xs bg-card/60 border border-border/80 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground transition-all"
                />
              </div>

              {/* Posts List */}
              {postsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-28 bg-card/60 border border-border/80 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center space-y-2 p-8 rounded-2xl border border-dashed border-border/80 bg-muted/10 max-w-sm">
                    <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-xs font-semibold text-foreground">
                      {search ? "No discussions match your filter" : "No discussions yet"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Be the first to post a study question or resource.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPosts.map((post) => {
                    const isFaculty = post.author_role === "teacher";
                    return (
                    <Card
                      key={post.id}
                      className={`bg-card/70 shadow-xs transition-colors rounded-2xl group ${
                        isFaculty
                          ? "border-l-4 border-l-brand-red border-y border-r border-border/80 bg-brand-red/[0.03] hover:border-r-brand-red/40"
                          : "border-border/80 hover:border-border"
                      }`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${isFaculty ? "bg-brand-red text-brand-red-foreground" : avatarColor(post.author_initials)}`}>
                              {post.author_initials}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold text-foreground">{post.author_name}</p>
                                {isFaculty && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider bg-brand-red/15 text-brand-red px-1.5 py-0.5 rounded-full border border-brand-red/25">
                                    Faculty
                                  </span>
                                )}
                                {post.user_id !== currentUser?.id && (
                                  <button
                                    onClick={() => openChatWithPeer(post.user_id)}
                                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-1.5 py-0.5 rounded transition-colors"
                                  >
                                    Direct Message
                                  </button>
                                )}
                                {post.user_id === currentUser?.id && (
                                  <span className="text-[9px] bg-muted px-1.5 py-0.2 rounded font-mono text-muted-foreground">You</span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground font-mono">{timeAgo(post.created_at)}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-muted border border-border/50 text-muted-foreground">
                              #general
                            </span>
                            {post.user_id === currentUser?.id && (
                              <button
                                onClick={() => handleDeletePost(post.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-muted"
                                title="Delete post"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>

                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <button
                            onClick={() => handleLike(post)}
                            className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                              post.likedByMe ? "text-red-500" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Heart className={`h-3.5 w-3.5 ${post.likedByMe ? "fill-red-500 text-red-500" : ""}`} />
                            <span>{post.likes} {post.likes === 1 ? "Like" : "Likes"}</span>
                          </button>

                          {post.user_id !== currentUser?.id && (
                            <button
                              onClick={() => openChatWithPeer(post.user_id)}
                              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-2.5 py-1 rounded-lg transition-colors"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>Reply in DM</span>
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              )}
              <div ref={feedEndRef} />
            </main>

            {/* Right Sidebar: Classmates & Groups */}
            <aside className="w-72 border-l border-border/80 bg-card/40 hidden xl:flex flex-col overflow-hidden shrink-0">
              <div className="grid grid-cols-2 border-b border-border/60 p-1 bg-card/60">
                <button
                  onClick={() => setRightPanel("members")}
                  className={`text-xs font-medium py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    rightPanel === "members" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" /> Classmates
                </button>
                <button
                  onClick={() => { setRightPanel("groups"); fetchGroups(); }}
                  className={`text-xs font-medium py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    rightPanel === "groups" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <UsersRound className="h-3.5 w-3.5" /> Study Groups
                </button>
              </div>

              {/* Members panel */}
              {rightPanel === "members" && (
                <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                        Directory
                      </p>
                      <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 mb-2.5 bg-muted/40 p-1 rounded-xl border border-border/60">
                      <button
                        onClick={() => setMemberFilter("all")}
                        className={`text-[10px] font-medium py-1 rounded-lg transition-all ${
                          memberFilter === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                        }`}
                      >
                        All ({membersWithPresence.length})
                      </button>
                      <button
                        onClick={() => setMemberFilter("online")}
                        className={`text-[10px] font-medium py-1 rounded-lg transition-all flex items-center justify-center gap-1 ${
                          memberFilter === "online" ? "bg-background text-emerald-500 shadow-xs font-semibold" : "text-muted-foreground"
                        }`}
                      >
                        <Circle className="h-1.5 w-1.5 fill-emerald-500 text-emerald-500" />
                        Online
                      </button>
                      <button
                        onClick={() => setMemberFilter("offline")}
                        className={`text-[10px] font-medium py-1 rounded-lg transition-all ${
                          memberFilter === "offline" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                        }`}
                      >
                        Offline
                      </button>
                    </div>

                    <div className="relative mb-2.5">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search student..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="w-full h-7 pl-7 pr-2 text-[11px] bg-muted/40 border border-border/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                      />
                    </div>

                    {membersLoading ? (
                      <div className="space-y-1.5">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="h-9 bg-muted/40 rounded-xl animate-pulse" />
                        ))}
                      </div>
                    ) : filteredMembers.length === 0 ? (
                      <div className="text-center p-4 border border-dashed border-border/80 rounded-xl my-2">
                        <UserCheck className="h-5 w-5 mx-auto text-muted-foreground/40 mb-1" />
                        <p className="text-[10px] text-muted-foreground">No students found</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredMembers.map((member) => (
                          <div
                            key={member.id}
                            onClick={() => {
                              if (member.id !== currentUser?.id) {
                                openChatWithPeer(member.id);
                              }
                            }}
                            className={`flex items-center justify-between p-2 rounded-xl border border-transparent hover:border-border/60 hover:bg-muted/40 transition-all cursor-pointer group ${
                              member.id === currentUser?.id ? "opacity-60 cursor-default" : ""
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="relative shrink-0">
                                <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${avatarColor(member.initials)}`}>
                                  {member.initials}
                                </div>
                                {member.status === "online" && (
                                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-card" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                  {member.name}
                                </p>
                                <p className="text-[9px] text-muted-foreground truncate">{member.department}</p>
                              </div>
                            </div>

                            {member.id !== currentUser?.id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openChatWithPeer(member.id);
                                }}
                                className="h-6 px-2 text-[10px] font-medium rounded bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
                              >
                                DM
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Groups panel */}
              {rightPanel === "groups" && (
                <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">Study Groups</p>
                    <Button size="sm" variant="outline" onClick={() => setShowCreateGroup(!showCreateGroup)} className="h-6 text-[10px] px-2 gap-1 rounded-lg">
                      <Plus className="h-2.5 w-2.5" /> Create
                    </Button>
                  </div>

                  {showCreateGroup && (
                    <Card className="border-border/80 bg-muted/30">
                      <CardContent className="p-3">
                        <form onSubmit={handleCreateGroup} className="space-y-2">
                          <input
                            type="text"
                            placeholder="Group name (e.g. DBMS Study)"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            className="w-full h-7 px-2 text-[11px] bg-card border border-border/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                            required
                          />
                          <input
                            type="text"
                            placeholder="Description (optional)"
                            value={newGroupDesc}
                            onChange={(e) => setNewGroupDesc(e.target.value)}
                            className="w-full h-7 px-2 text-[11px] bg-card border border-border/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <div className="flex gap-1.5">
                            <Button type="submit" size="sm" disabled={groupSubmitting || !newGroupName.trim()} className="flex-1 h-7 text-[10px] bg-foreground text-background hover:bg-foreground/90">
                              {groupSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create Group"}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreateGroup(false)} className="h-7 w-7 p-0">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </form>
                      </CardContent>
                    </Card>
                  )}

                  {groupsLoading ? (
                    <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 bg-muted/40 animate-pulse rounded-xl" />)}</div>
                  ) : groups.length === 0 ? (
                    <div className="text-center p-6 border border-dashed border-border/80 rounded-xl">
                      <UsersRound className="h-5 w-5 mx-auto text-muted-foreground/40 mb-1" />
                      <p className="text-[10px] font-semibold text-foreground">No study groups yet</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">Start the first group for your batch.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {groups.map((group) => (
                        <div key={group.id} className="p-2.5 rounded-xl border border-border/80 bg-card/60 hover:border-border transition-all">
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <div className="h-5 w-5 rounded-md border border-border bg-muted flex items-center justify-center shrink-0">
                                  <UsersRound className="h-2.5 w-2.5 text-muted-foreground" />
                                </div>
                                <p className="text-xs font-semibold text-foreground truncate">{group.name}</p>
                              </div>
                              {group.description && (
                                <p className="text-[10px] text-muted-foreground mt-1 truncate">{group.description}</p>
                              )}
                              <p className="text-[9px] font-mono text-muted-foreground mt-0.5">
                                {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <button
                              onClick={() => handleJoinGroup(group.id, group.isMember || false)}
                              className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-lg transition-all ${
                                group.isMember ? "bg-muted text-muted-foreground hover:text-red-500" : "bg-foreground text-background hover:bg-foreground/90"
                              }`}
                            >
                              {group.isMember ? "Leave" : "Join"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ── MODAL: Start New Chat (Classmates Directory) ── */}
        {showNewChatModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150">
              <div className="p-4 border-b border-border/80 flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl border border-border bg-muted flex items-center justify-center text-foreground">
                    <MessageSquarePlus className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">New Direct Chat</h2>
                    <p className="text-[11px] text-muted-foreground">Select a student from your batch</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNewChatModal(false)}
                  className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="p-3 border-b border-border/60 bg-card">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by student name or department..."
                    value={newChatSearch}
                    onChange={(e) => setNewChatSearch(e.target.value)}
                    className="w-full h-8 pl-9 pr-3 text-xs bg-muted/40 border border-border/80 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                    autoFocus
                  />
                </div>
              </div>

              {/* Directory List */}
              <div className="flex-1 overflow-y-auto p-2 scrollbar-thin space-y-1">
                {allClassmatesForNewChat.length === 0 ? (
                  <div className="text-center p-6 text-muted-foreground text-xs">
                    No students match "{newChatSearch}"
                  </div>
                ) : (
                  allClassmatesForNewChat.map((classmate) => (
                    <div
                      key={classmate.id}
                      onClick={() => {
                        openChatWithPeer(classmate.id);
                        setShowNewChatModal(false);
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-transparent hover:border-border/60 hover:bg-muted/40 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold ${avatarColor(classmate.initials)}`}>
                            {classmate.initials}
                          </div>
                          {classmate.status === "online" && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-card" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                            {classmate.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {classmate.department}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs font-medium gap-1 text-muted-foreground group-hover:text-foreground group-hover:bg-muted">
                        <MessageCircle className="h-3 w-3" /> Chat
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </ChatLayout>
  );
}
