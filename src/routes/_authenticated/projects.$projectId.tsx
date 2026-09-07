import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyOrgId, getMyUserId, logActivity } from "@/lib/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, LoadingRows } from "@/components/app/PageHeader";
import { ProjectStatusBadge, StatusBadge, OverdueBadge } from "@/components/app/StatusBadge";
import { CONTENT_TYPE_LABELS, formatDate, isOverdue, type ContentType } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project | ApproveFlow" },
      { name: "description", content: "Content tasks moving through review and client approval." },
      { property: "og:title", content: "Project | ApproveFlow" },
      { property: "og:description", content: "Content tasks moving through review and client approval." },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contentType, setContentType] = useState<ContentType>("instagram_reel");
  const [assignee, setAssignee] = useState<string>("unassigned");

  const { data, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const [{ data: project, error }, { data: tasks }, { data: members }] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, description, status, organization_id, client_id, clients(id, name)")
          .eq("id", projectId)
          .maybeSingle(),
        supabase
          .from("tasks")
          .select("id, title, status, content_type, due_date, updated_at, assigned_to")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      if (error) throw error;
      return { project, tasks: tasks ?? [], members: members ?? [] };
    },
  });

  const createTask = useMutation({
    mutationFn: async (form: { title: string; description: string; dueDate: string }) => {
      if (!data?.project) throw new Error("Project not loaded");
      const organizationId = await getMyOrgId();
      const createdBy = await getMyUserId();
      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          organization_id: organizationId,
          client_id: data.project.client_id,
          project_id: projectId,
          title: form.title,
          description: form.description || null,
          content_type: contentType,
          status: "draft",
          assigned_to: assignee === "unassigned" ? null : assignee,
          due_date: form.dueDate || null,
          created_by: createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      await logActivity({
        organizationId,
        taskId: task.id,
        eventType: "task_created",
        metadata: { name: form.title },
      });
    },
    onSuccess: () => {
      toast.success("Task created");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingRows rows={5} />;
  if (!data?.project) return <EmptyState title="Project not found" description="This project may have been removed." />;

  const project = data.project;
  const memberName = (id: string | null) =>
    data.members.find((m) => m.id === id)?.full_name ?? (id ? "Team member" : "Unassigned");

  return (
    <section className="space-y-8">
      <PageHeader
        title={project.name}
        description={project.clients?.name ?? ""}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  createTask.mutate({
                    title: String(fd.get("title") ?? "").trim(),
                    description: String(fd.get("description") ?? "").trim(),
                    dueDate: String(fd.get("due") ?? ""),
                  });
                }}
              >
                <DialogHeader>
                  <DialogTitle>New content task</DialogTitle>
                  <DialogDescription>One piece of content, with its own versions and approvals.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-5">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" name="title" required placeholder="September Reel 01" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Content type</Label>
                    <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" rows={3} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Assigned creator</Label>
                    <Select value={assignee} onValueChange={setAssignee}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {data.members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.full_name ?? m.email ?? "Team member"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="due">Due date</Label>
                    <Input id="due" name="due" type="date" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createTask.isPending}>
                    {createTask.isPending ? "Creating…" : "Create task"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProjectStatusBadge status={project.status} />
        <p className="text-sm text-muted-foreground">{project.description ?? "No description"}</p>
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-lg font-semibold tracking-tight">Tasks</h3>
        {!data.tasks.length ? (
          <EmptyState title="No tasks yet" description="Add the first piece of content for this project." />
        ) : (
          data.tasks.map((t) => (
            <Link
              key={t.id}
              to="/tasks/$taskId"
              params={{ taskId: t.id }}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-5 py-4 hover:bg-muted/40"
            >
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="text-xs text-muted-foreground">
                  {CONTENT_TYPE_LABELS[t.content_type]} · {memberName(t.assigned_to)} · Due {formatDate(t.due_date)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOverdue(t.due_date, t.status) ? <OverdueBadge /> : null}
                <StatusBadge status={t.status} />
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
