import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-6">
          Error 404 · Page Not Found
        </p>
        <h1
          className="font-sans font-extrabold text-foreground"
          style={{ fontSize: "clamp(4rem, 12vw, 6rem)", letterSpacing: "-0.05em", lineHeight: 1 }}
        >
          404
        </h1>
        <p className="mt-6 text-sm font-sans text-muted-foreground leading-relaxed">
          The page you requested does not exist or has been updated.
          <br />
          Choose an option below to return to AcadSphere:
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/app"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 font-sans text-xs font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-90"
          >
            Go to Student Dashboard
          </Link>
          <Link
            to="/app/attendance"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-5 py-2.5 font-sans text-xs font-bold text-foreground transition-colors hover:bg-accent"
          >
            Attendance Engine
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-muted/50 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-red-500 mb-4 font-bold">
          System Recovery Boundary
        </p>
        <h1 className="font-sans font-extrabold text-2xl tracking-tight text-foreground">
          Temporary Loading Disruption
        </h1>
        <p className="mt-3 text-sm font-sans text-muted-foreground leading-relaxed">
          {error?.message || "An unexpected error occurred while loading this view."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-2.5 font-sans text-xs font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-90 cursor-pointer"
          >
            Reload Page
          </button>
          <a
            href="/app"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-5 py-2.5 font-sans text-xs font-bold text-foreground transition-colors hover:bg-accent"
          >
            Go to Student Dashboard
          </a>
          <a
            href="/app/attendance"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-muted/50 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Attendance Engine
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AcadSphere — AI Academic Operating System" },
      {
        name: "description",
        content:
          "An AI-powered academic OS: career roadmaps, study planning, resume scoring, and more for MCA, BCA, and B.Tech students.",
      },
      { name: "author", content: "AcadSphere" },
      { property: "og:title", content: "AcadSphere — AI Academic Operating System" },
      {
        property: "og:description",
        content: "Mentor, study partner, career advisor, placement coach — in one platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Preconnect to Google Fonts and Fontshare
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      { rel: "preconnect", href: "https://api.fontshare.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=switzer@100,200,300,400,500,600,700,800,900&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap",
      },
      // Fraunces — the wordmark / brand-headline display face (deliberately
      // not another generic SaaS grotesk like the rest of the UI text)
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function syncSessionToLocal(session: any) {
  if (!session?.user || typeof window === "undefined") return;
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
    supabase.from("profiles").upsert([
      {
        id: user.id,
        full_name: fullName,
        avatar_url: avatarUrl,
        degree: "MSc Big Data Analytics",
        target_role: "Software Engineer / Data Scientist",
        updated_at: new Date().toISOString(),
      }
    ]).then(() => {});
  } catch (_) {}
}

function AuthSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        syncSessionToLocal(session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      router.invalidate();
      queryClient.invalidateQueries();

      if (session) {
        syncSessionToLocal(session);
      }
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
