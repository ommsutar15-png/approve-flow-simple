import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const DESCRIPTION =
  "ApproveFlow is client approval and content review for creative agencies: send content, get a clear decision, keep every revision in one place.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ApproveFlow — Client approval for creative teams" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "ApproveFlow — Client approval for creative teams" },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg font-semibold tracking-tight">ApproveFlow</span>
        {signedIn ? (
          <Button asChild size="sm">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight text-balance">
          Send content. Get clear approval.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Stop chasing feedback across chats, inboxes and shared drives. Share one link, let your
          client approve or request changes, and keep every version and decision on record.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to={signedIn ? "/dashboard" : "/auth"}>
              {signedIn ? "Open dashboard" : "Start free"}
            </Link>
          </Button>
        </div>
        <p className="mt-16 text-sm text-muted-foreground">
          Clients never need an account — they just open the link and decide.
        </p>
      </main>
    </div>
  );
}
