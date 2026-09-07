import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Mail, Phone, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyOrgId, logActivity } from "@/lib/org";
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
import { ProjectStatusBadge, StatusBadge } from "@/components/app/StatusBadge";
import { PROJECT_STATUS_LABELS, formatDate, type ProjectStatus } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Client | ApproveFlow" },
      { name: "description", content: "Projects, approvals and activity for this client account." },
      { property: "og:title", content: "Client | ApproveFlow" },
      { property: "og:description", content: "Projects, approvals and activity for this client account." },
    ],
  }),
  component: ClientDetail,
});

function ClientDetail() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>("active");

  const { data, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const [{ data: client, error }, { data: projects }, { data: tasks }] = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
        supabase
          .from("projects")
          .select("id, name, description, status, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("tasks")
          .select("id, title, status, due_date, project_id, updated_at")
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false }),
      ]);
      if (error) throw error;
      return { client, projects: projects ?? [], tasks: tasks ?? [] };
    },
  });

  const createProject = useMutation({
    mutationFn: async (form: { name: string; description: string; status: ProjectStatus }) => {
      const organizationId = await getMyOrgId();
      const { data: project, error } = await supabase
        .from("projects")
        .insert({
          organization_id: organizationId,
          client_id: clientId,
          name: form.name,
          description: form.description || null,
          status: form.status,
        })
        .select("id")
        .single();
      if (error) throw error;
      await logActivity({ organizationId, eventType: "project_created", metadata: { name: form.name } });
      return project;
    },
    onSuccess: () => {
      toast.success("Project created");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingRows rows={5} />;
  if (!data?.client) return <EmptyState title="Client not found" description="This client may have been removed." />;

  const client = data.client;
  const pending = data.tasks.filter(
    (t) => t.status === "awaiting_client" || t.status === "changes_requested",
  );

  return (
    <section className="space-y-8">
      <PageHeader
        title={client.name}
        description={client.company_name ?? "Client account"}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  createProject.mutate({
                    name: String(fd.get("name") ?? "").trim(),
                    description: String(fd.get("description") ?? "").trim(),
                    status,
                  });
                }}
              >
                <DialogHeader>
                  <DialogTitle>New project</DialogTitle>
                  <DialogDescription>Group the content you produce for {client.name}.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-5">
                  <div className="grid gap-2">
                    <Label htmlFor="pname">Name</Label>
                    <Input id="pname" name="name" required placeholder="September Social Media" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pdesc">Description</Label>
                    <Textarea id="pdesc" name="description" rows={3} placeholder="Monthly content programme" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createProject.isPending}>
                    {createProject.isPending ? "Creating…" : "Create project"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard icon={<Building2 className="h-4 w-4" />} label="Company" value={client.company_name ?? "—"} />
        <InfoCard icon={<Mail className="h-4 w-4" />} label="Email" value={client.email ?? "—"} />
        <InfoCard icon={<Phone className="h-4 w-4" />} label="Phone" value={client.phone ?? "—"} />
      </div>

      <div>
        <h3 className="font-display text-lg font-semibold tracking-tight">Projects</h3>
        <div className="mt-3 space-y-3">
          {!data.projects.length ? (
            <EmptyState title="No projects yet" description="Create a project to start adding content tasks." />
          ) : (
            data.projects.map((p) => (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="flex items-center justify-between rounded-xl border border-border bg-background px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {data.tasks.filter((t) => t.project_id === p.id).length} tasks · {p.description ?? "No description"}
                  </div>
                </div>
                <ProjectStatusBadge status={p.status} />
              </Link>
            ))
          )}
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-semibold tracking-tight">Pending approvals</h3>
        <div className="mt-3 space-y-3">
          {!pending.length ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting on this client right now.</p>
          ) : (
            pending.map((t) => (
              <Link
                key={t.id}
                to="/tasks/$taskId"
                params={{ taskId: t.id }}
                className="flex items-center justify-between rounded-xl border border-border bg-background px-5 py-4 hover:bg-muted/40"
              >
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">Due {formatDate(t.due_date)}</div>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
