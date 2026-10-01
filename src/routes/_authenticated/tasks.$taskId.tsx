import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Send, Copy, ExternalLink, MessageSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyUserId } from "@/lib/org";
import {
  createApprovalLink,
  createVersionUploadUrl,
  finalizeVersion,
  getVersionFileUrl,
} from "@/lib/content.functions";
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
import { EmptyState, LoadingRows } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import {
  CONTENT_TYPE_LABELS,
  describeEvent,
  formatBytes,
  formatDate,
  formatDateTime,
} from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  head: () => ({
    meta: [
      { title: "Task | ApproveFlow" },
      { name: "description", content: "Versions, feedback and approval status for this content piece." },
      { property: "og:title", content: "Task | ApproveFlow" },
      { property: "og:description", content: "Versions, feedback and approval status for this content piece." },
    ],
  }),
  component: TaskDetail,
});

function TaskDetail() {
  const { taskId } = Route.useParams();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const getUploadUrl = useServerFn(createVersionUploadUrl);
  const saveVersion = useServerFn(finalizeVersion);
  const fileUrl = useServerFn(getVersionFileUrl);
  const requestApproval = useServerFn(createApprovalLink);

  const { data, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const { data: task, error } = await supabase
        .from("tasks")
        .select(
          "id, title, description, status, content_type, due_date, assigned_to, current_version_id, organization_id, created_at, clients(id, name, company_name), projects(id, name)",
        )
        .eq("id", taskId)
        .maybeSingle();
      if (error) throw error;
      if (!task) return null;

      const [{ data: versions }, { data: comments }, { data: approvals }, { data: activity }, { data: members }] =
        await Promise.all([
          supabase
            .from("task_versions")
            .select("*")
            .eq("task_id", taskId)
            .order("version_number", { ascending: false }),
          supabase.from("comments").select("*").eq("task_id", taskId).order("created_at", { ascending: true }),
          supabase.from("approvals").select("*").eq("task_id", taskId),
          supabase
            .from("activity_logs")
            .select("*")
            .eq("task_id", taskId)
            .order("created_at", { ascending: false }),
          supabase.from("profiles").select("id, full_name, email"),
        ]);

      return {
        task,
        versions: versions ?? [],
        comments: comments ?? [],
        approvals: approvals ?? [],
        activity: activity ?? [],
        members: members ?? [],
      };
    },
  });

  const currentVersion = data?.versions[0] ?? null;

  const { data: previewUrl } = useQuery({
    queryKey: ["version-url", currentVersion?.id],
    enabled: Boolean(currentVersion?.id),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => (await fileUrl({ data: { versionId: currentVersion!.id } })).url,
  });

  const upload = useMutation({
    mutationFn: async (form: { file: File; caption: string; notes: string }) => {
      const { path, signedUrl } = await getUploadUrl({
        data: { taskId, fileName: form.file.name },
      });
      const res = await fetch(signedUrl, {
        method: "PUT",
        headers: { "content-type": form.file.type || "application/octet-stream" },
        body: form.file,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      return saveVersion({
        data: {
          taskId,
          filePath: path,
          fileName: form.file.name,
          fileType: form.file.type || null,
          fileSize: form.file.size,
          caption: form.caption || null,
          notes: form.notes || null,
        },
      });
    },
    onSuccess: (result) => {
      toast.success(`Version ${result.versionNumber} uploaded`);
      setUploadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approvalLink = useMutation({
    mutationFn: async (recipientEmail: string) => {
      if (!currentVersion) throw new Error("Upload a version first");
      const result = await requestApproval({
        data: { taskId, versionId: currentVersion.id, recipientEmail: recipientEmail || null },
      });
      return `${window.location.origin}/approve/${result.token}`;
    },
    onSuccess: (url) => {
      setApprovalUrl(url);
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      if (!data?.task) return;
      const userId = await getMyUserId();
      const { error } = await supabase.from("comments").insert({
        organization_id: data.task.organization_id,
        task_id: taskId,
        version_id: currentVersion?.id ?? null,
        author_type: "agency",
        author_user_id: userId,
        body,
      });
      if (error) throw error;
      await supabase.from("activity_logs").insert({
        organization_id: data.task.organization_id,
        task_id: taskId,
        actor_type: "agency",
        actor_id: userId,
        event_type: "comment_added",
        metadata: {},
      });
    },
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openVersion(versionId: string) {
    try {
      const { url } = await fileUrl({ data: { versionId } });
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Could not open that file");
    }
  }

  if (isLoading) return <LoadingRows rows={6} />;
  if (!data?.task) return <EmptyState title="Task not found" description="This task may have been removed." />;

  const task = data.task;
  const assignee =
    data.members.find((m) => m.id === task.assigned_to)?.full_name ??
    (task.assigned_to ? "Team member" : "Unassigned");

  return (
    <section className="space-y-8">
      <header className="space-y-3">
        <div className="text-xs text-muted-foreground">
          <Link to="/clients/$clientId" params={{ clientId: task.clients!.id }} className="hover:underline">
            {task.clients?.name}
          </Link>{" "}
          /{" "}
          <Link to="/projects/$projectId" params={{ projectId: task.projects!.id }} className="hover:underline">
            {task.projects?.name}
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">{task.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <StatusBadge status={task.status} />
              <span>{CONTENT_TYPE_LABELS[task.content_type]}</span>
              <span>Due {formatDate(task.due_date)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Upload New Version
            </Button>
            <Button
              onClick={() => {
                setApprovalUrl(null);
                setLinkOpen(true);
              }}
              disabled={!currentVersion}
            >
              <Send className="mr-2 h-4 w-4" /> Request Client Approval
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-8">
          <div className="rounded-xl border border-border bg-background p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold tracking-tight">
                {currentVersion ? `Current content — Version ${currentVersion.version_number}` : "No content yet"}
              </h3>
              {currentVersion ? (
                <Button variant="ghost" size="sm" onClick={() => openVersion(currentVersion.id)}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Open file
                </Button>
              ) : null}
            </div>
            <div className="mt-4">
              {!currentVersion ? (
                <p className="text-sm text-muted-foreground">
                  Upload the first version to share this content with the client.
                </p>
              ) : (
                <FilePreview
                  url={previewUrl ?? null}
                  fileType={currentVersion.file_type}
                  fileName={currentVersion.file_name}
                />
              )}
            </div>
            {currentVersion?.caption ? (
              <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm">{currentVersion.caption}</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-lg font-semibold tracking-tight">Version history</h3>
            {!data.versions.length ? (
              <p className="text-sm text-muted-foreground">No versions yet.</p>
            ) : (
              data.versions.map((v) => {
                const approval = data.approvals.find((a) => a.version_id === v.id);
                const feedback = data.comments.filter((c) => c.version_id === v.id);
                const uploader = data.members.find((m) => m.id === v.uploaded_by)?.full_name ?? "Team member";
                return (
                  <div key={v.id} className="rounded-xl border border-border bg-background p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">Version {v.version_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {uploader} · {formatDateTime(v.created_at)} · {v.file_name} {formatBytes(v.file_size)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {approval ? (
                          <span
                            className={
                              approval.decision === "approved"
                                ? "rounded-full border border-chart-2/30 bg-chart-2/15 px-2.5 py-0.5 text-xs font-medium text-chart-2"
                                : "rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
                            }
                          >
                            {approval.decision === "approved" ? "Approved" : "Changes requested"}
                          </span>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => openVersion(v.id)}>
                          Preview
                        </Button>
                      </div>
                    </div>
                    {v.notes ? (
                      <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Internal notes</span>
                        <br />
                        {v.notes}
                      </p>
                    ) : null}
                    {approval?.ai_summary ? (
                      <RevisionPoints summary={approval.ai_summary as unknown as AiSummary} />
                    ) : null}
                    {feedback.length ? (
                      <ul className="mt-3 space-y-2">
                        {feedback.map((c) => (
                          <li key={c.id} className="rounded-lg border border-border p-3 text-sm">
                            <div className="text-xs text-muted-foreground">
                              {c.author_type === "client" ? c.author_name ?? "Client" : "Agency"} ·{" "}
                              {formatDateTime(c.created_at)}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-lg font-semibold tracking-tight">Internal discussion</h3>
            <div className="rounded-xl border border-border bg-background p-5">
              <Textarea
                rows={3}
                value={comment}
                placeholder="Leave a note for your team…"
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() => addComment.mutate(comment.trim())}
                >
                  <MessageSquare className="mr-2 h-4 w-4" /> Add comment
                </Button>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border border-border bg-background p-5 text-sm">
            <SidebarRow label="Assigned creator" value={assignee} />
            <SidebarRow label="Approval status" value={<StatusBadge status={task.status} />} />
            <SidebarRow label="Client" value={task.clients?.name ?? "—"} />
            <SidebarRow label="Project" value={task.projects?.name ?? "—"} />
            <SidebarRow label="Due date" value={formatDate(task.due_date)} />
            <SidebarRow
              label="Current version"
              value={currentVersion ? `Version ${currentVersion.version_number}` : "None"}
            />
          </div>

          <div className="rounded-xl border border-border bg-background p-5">
            <h4 className="font-display text-sm font-semibold tracking-tight">Activity</h4>
            <ol className="mt-3 space-y-3">
              {!data.activity.length ? (
                <li className="text-sm text-muted-foreground">No activity yet.</li>
              ) : (
                data.activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="capitalize">
                      {describeEvent(a.event_type, a.metadata as Record<string, unknown> | null)}
                    </span>
                    <div className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</div>
                  </li>
                ))
              )}
            </ol>
          </div>
        </aside>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const file = fd.get("file") as File | null;
              if (!file || !file.size) {
                toast.error("Choose a file to upload");
                return;
              }
              upload.mutate({
                file,
                caption: String(fd.get("caption") ?? "").trim(),
                notes: String(fd.get("notes") ?? "").trim(),
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Upload new version</DialogTitle>
              <DialogDescription>
                Previous versions are never overwritten. This will become Version{" "}
                {(currentVersion?.version_number ?? 0) + 1}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5">
              <div className="grid gap-2">
                <Label htmlFor="file">File</Label>
                <Input id="file" name="file" type="file" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="caption">Caption / copy (shared with client)</Label>
                <Textarea id="caption" name="caption" rows={3} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Internal notes (never shown to the client)</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={upload.isPending}>
                {upload.isPending ? "Uploading…" : "Upload version"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request client approval</DialogTitle>
            <DialogDescription>
              Creates a secure link for Version {currentVersion?.version_number} only. The task moves to Awaiting
              Client.
            </DialogDescription>
          </DialogHeader>
          {approvalUrl ? (
            <div className="space-y-3 py-4">
              <Label>Approval link</Label>
              <div className="flex gap-2">
                <Input readOnly value={approvalUrl} onFocus={(e) => e.currentTarget.select()} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(approvalUrl);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copy it now — for security only a hash is stored, so it cannot be shown again.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                approvalLink.mutate(String(fd.get("email") ?? "").trim());
              }}
            >
              <div className="grid gap-2 py-4">
                <Label htmlFor="email">Client email (optional)</Label>
                <Input id="email" name="email" type="email" placeholder="hello@client.com" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={approvalLink.isPending}>
                  {approvalLink.isPending ? "Creating…" : "Create approval link"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

type AiSummary = {
  summary: string;
  points: { area: string; action: string; priority: "high" | "medium" | "low" }[];
};

function RevisionPoints({ summary }: { summary: AiSummary }) {
  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" /> AI revision points
      </div>
      <p className="mt-2 text-muted-foreground">{summary.summary}</p>
      <ul className="mt-3 space-y-2">
        {summary.points.map((p, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 shrink-0 rounded bg-background px-1.5 py-0.5 text-xs font-medium">{p.area}</span>
            <span className="flex-1">{p.action}</span>
            {p.priority === "high" ? (
              <span className="shrink-0 text-xs font-medium text-destructive">High</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Generated from the client's feedback — check the original below.</p>
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function FilePreview({
  url,
  fileType,
  fileName,
}: {
  url: string | null;
  fileType: string | null;
  fileName: string;
}) {
  if (!url) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  const type = fileType ?? "";
  if (type.startsWith("image/")) {
    return <img src={url} alt={fileName} className="max-h-[520px] w-full rounded-lg object-contain" />;
  }
  if (type.startsWith("video/")) {
    return <video src={url} controls className="max-h-[520px] w-full rounded-lg bg-black" />;
  }
  if (type === "application/pdf") {
    return <iframe src={url} title={fileName} className="h-[520px] w-full rounded-lg border border-border" />;
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-sm text-muted-foreground">Preview isn’t available for {fileName}.</p>
      <a href={url} download={fileName}>
        <Button variant="outline" size="sm">
          Download file
        </Button>
      </a>
    </div>
  );
}
