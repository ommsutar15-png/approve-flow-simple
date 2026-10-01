import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageSquareWarning, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CONTENT_TYPE_LABELS, formatDate, formatDateTime } from "@/lib/labels";

export const Route = createFileRoute("/approve/$token")({
  head: () => ({
    meta: [
      { title: "Review content | ApproveFlow" },
      { name: "description", content: "Review the content shared with you and approve it or request changes." },
      { property: "og:title", content: "Review content | ApproveFlow" },
      { property: "og:description", content: "Review the content shared with you and approve it or request changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovePage,
});

type Payload =
  | { state: "invalid" | "revoked" | "expired" }
  | {
      state: "valid";
      agencyName: string;
      clientName: string | null;
      projectName: string | null;
      title: string;
      contentType: keyof typeof CONTENT_TYPE_LABELS;
      dueDate: string | null;
      version: { number: number; fileName: string; fileType: string | null; caption: string | null; url: string | null };
      decision: null | {
        decision: "approved" | "changes_requested";
        by: string | null;
        at: string;
        categories: string[];
        feedback: string | null;
      };
    };

const CATEGORIES = ["Design", "Video", "Copy", "Music", "Other"] as const;
const MESSAGES = {
  invalid: "This approval link is invalid.",
  revoked: "This approval link is no longer active.",
  expired: "This approval link has expired.",
};

function ApprovePage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const [visited, setVisited] = useState(false);
  useEffect(() => setVisited(true), []);

  const { data, isLoading } = useQuery({
    queryKey: ["approve", token],
    enabled: visited,
    queryFn: async (): Promise<Payload> => {
      const res = await fetch(`/api/public/approve/${encodeURIComponent(token)}?visit=1`);
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: "approved" | "changes_requested") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/approve/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          name: name.trim(),
          email: email.trim() || null,
          feedback: decision === "changes_requested" ? feedback.trim() : null,
          categories: decision === "changes_requested" ? cats : [],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
      setConfirmOpen(false);
      setChangesOpen(false);
      const fresh = await fetch(`/api/public/approve/${encodeURIComponent(token)}`).then((r) => r.json());
      qc.setQueryData(["approve", token], fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !data) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
      </Shell>
    );
  }

  if (data.state !== "valid") {
    return (
      <Shell>
        <div className="mx-auto mt-20 max-w-md text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">{MESSAGES[data.state]}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please contact the agency that shared it for a new link.</p>
        </div>
      </Shell>
    );
  }

  const d = data.decision;
  const nameOk = name.trim().length > 0;

  return (
    <Shell agency={data.agencyName}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground">
              {[data.clientName, data.projectName].filter(Boolean).join(" · ")}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{data.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Version {data.version.number} · {CONTENT_TYPE_LABELS[data.contentType]}
              {data.dueDate ? ` · Due ${formatDate(data.dueDate)}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <Preview v={data.version} />
          </div>
          {data.version.caption ? (
            <div className="rounded-xl border border-border bg-background p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Caption</div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{data.version.caption}</p>
            </div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
            {d ? (
              d.decision === "approved" ? (
                <div className="space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-chart-2" />
                  <h2 className="font-display text-xl font-semibold">Approved successfully</h2>
                  <p className="text-sm text-muted-foreground">
                    Version {data.version.number} approved by {d.by ?? "client"} on {formatDateTime(d.at)}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <MessageSquareWarning className="h-8 w-8 text-destructive" />
                  <h2 className="font-display text-xl font-semibold">Changes requested</h2>
                  <p className="text-sm text-muted-foreground">
                    Sent by {d.by ?? "client"} on {formatDateTime(d.at)}. The team will share a new version.
                  </p>
                  {d.categories.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {d.categories.map((c) => (
                        <span key={c} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {d.feedback ? (
                    <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{d.feedback}</p>
                  ) : null}
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold">Your decision</h2>
                  <p className="text-sm text-muted-foreground">Review the content, then approve or request changes.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button size="lg" className="w-full" disabled={!nameOk} onClick={() => setConfirmOpen(true)}>
                  Approve
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  disabled={!nameOk}
                  onClick={() => setChangesOpen(true)}
                >
                  Request Changes
                </Button>
                {!nameOk ? <p className="text-xs text-muted-foreground">Enter your name to continue.</p> : null}
              </div>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Version {data.version.number}?</DialogTitle>
            <DialogDescription>This records your final approval and can't be undone.</DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => submit("approved")}>
              {busy ? "Approving…" : "Confirm approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>Tell the team what should change. Be as specific as you like.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const on = cats.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCats(on ? cats.filter((x) => x !== c) : [...cats, c])}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <Textarea
              rows={6}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. The logo appears too late, and the music feels too loud under the voiceover…"
              maxLength={5000}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button disabled={busy || !feedback.trim()} onClick={() => submit("changes_requested")}>
              {busy ? "Sending…" : "Submit feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children, agency }: { children: React.ReactNode; agency?: string }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-display font-semibold tracking-tight">{agency ?? "ApproveFlow"}</span>
          <span className="text-xs text-muted-foreground">Secure review link</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

function Preview({ v }: { v: { url: string | null; fileType: string | null; fileName: string } }) {
  if (!v.url) return <p className="p-10 text-center text-sm text-muted-foreground">Preview unavailable.</p>;
  const t = v.fileType ?? "";
  if (t.startsWith("image/")) return <img src={v.url} alt={v.fileName} className="max-h-[640px] w-full rounded-lg object-contain" />;
  if (t.startsWith("video/")) return <video src={v.url} controls className="max-h-[640px] w-full rounded-lg bg-foreground" />;
  if (t === "application/pdf") return <iframe src={v.url} title={v.fileName} className="h-[640px] w-full rounded-lg" />;
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-sm text-muted-foreground">Preview isn't available for {v.fileName}.</p>
      <a href={v.url} download={v.fileName}>
        <Button variant="outline" size="sm">Download file</Button>
      </a>
    </div>
  );
}
