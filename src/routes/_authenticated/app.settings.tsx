import { createFileRoute, redirect } from "@tanstack/react-router";

// Settings merged into Profile — this route just forwards old links/bookmarks.
export const Route = createFileRoute("/_authenticated/app/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/app/profile" });
  },
});
