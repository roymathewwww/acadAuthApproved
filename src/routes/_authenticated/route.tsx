import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deriveDepartment } from "@/lib/derive-department";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1. Try fetching active Supabase session
    let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      session = data?.session ?? null;
    } catch (_) {}

    if (session) {
      const user = session.user;
      const meta = user.user_metadata || {};
      const fullName = meta.full_name || meta.name || user.email?.split("@")[0] || "Christ Student";
      const avatarUrl = meta.avatar_url || meta.picture || "";
      const providerToken = session.provider_token || "";

      // Class-roles: pull the real role/section/removed_at from the
      // server-authoritative profile row on every load — never trust a
      // stale/client-settable localStorage value for this. Deliberately
      // outside any try/catch that could swallow the redirect below.
      let profile: { role?: string; section?: string | null; removed_at?: string | null } | null = null;
      try {
        const { data: p } = await supabase
          .from("profiles")
          .select("role, section, removed_at")
          .eq("id", user.id)
          .maybeSingle();
        profile = p;
      } catch (_) {
        profile = null; // a failed lookup means "no info", never "removed"
      }

      if (profile?.removed_at) {
        await supabase.auth.signOut().catch(() => {});
        if (typeof window !== "undefined") {
          localStorage.removeItem("demo_session_token");
          localStorage.removeItem("demo_user_id");
          localStorage.removeItem("demo_user_role");
        }
        throw redirect({ to: "/auth", search: { removed: "1" } as any });
      }

      if (typeof window !== "undefined" && profile?.role) {
        localStorage.setItem("demo_user_role", profile.role);
        localStorage.setItem("demo_user_section", profile.section || "");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("demo_session_token", session.access_token);
        localStorage.setItem("demo_user_id", user.id);
        localStorage.setItem("demo_user_email", user.email || "");
        localStorage.setItem("demo_user_name", fullName);
        if (avatarUrl) localStorage.setItem("demo_user_avatar", avatarUrl);
        if (providerToken) localStorage.setItem("google_provider_token", providerToken);
      }

      return { user };
    }

    // 2. Check demo token
    const demoToken = typeof window !== "undefined"
      ? localStorage.getItem("demo_session_token")
      : null;

    if (demoToken) {
      const userId = localStorage.getItem("demo_user_id") || "demo";
      const email = localStorage.getItem("demo_user_email") || "student@christuniversity.in";
      return { user: { id: userId, email } };
    }

    throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        const session = data.session;
        const user = session.user;
        const meta = user.user_metadata || {};
        const fullName = meta.full_name || meta.name || user.email?.split("@")[0] || "Christ Student";
        const avatarUrl = meta.avatar_url || meta.picture || "";
        const providerToken = session.provider_token || "";

        localStorage.setItem("demo_session_token", session.access_token);
        localStorage.setItem("demo_user_id", user.id);
        localStorage.setItem("demo_user_email", user.email || "");
        localStorage.setItem("demo_user_name", fullName);
        if (avatarUrl) localStorage.setItem("demo_user_avatar", avatarUrl);
        if (providerToken) localStorage.setItem("google_provider_token", providerToken);

        try {
          supabase
            .from("profiles")
            .upsert([
              {
                id: user.id,
                full_name: fullName,
                avatar_url: avatarUrl,
                degree: deriveDepartment(user.email),
                updated_at: new Date().toISOString(),
              },
            ])
            .then(() => {});
        } catch (_) {}
      }
    });
  }, []);

  return <Outlet />;
}
