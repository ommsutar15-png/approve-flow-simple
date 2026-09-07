import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/app/PageHeader";
import { ProjectStatusBadge } from "@/components/app/StatusBadge";
import { formatDate } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects | ApproveFlow" },
      { name: "description", content: "Campaigns and content programmes per client." },
      { property: "og:title", content: "Projects | ApproveFlow" },
      { property: "og:description", content: "Campaigns and content programmes per client." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const [{ data: projects, error }, { data: tasks }] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, description, status, created_at, clients(id, name)")
          .order("created_at", { ascending: false }),
        supabase.from("tasks").select("id, project_id, status"),
      ]);
      if (error) throw error;
      return (projects ?? []).map((p) => ({
        ...p,
        taskCount: (tasks ?? []).filter((t) => t.project_id === p.id).length,
        pending: (tasks ?? []).filter(
          (t) => t.project_id === p.id && (t.status === "awaiting_client" || t.status === "changes_requested"),
        ).length,
      }));
    },
  });

  return (
    <section className="space-y-6">
      <PageHeader title="Projects" description="Campaigns and content programmes per client." />
      {isLoading ? (
        <LoadingRows />
      ) : !data?.length ? (
        <EmptyState
          title="No projects yet"
          description="Open a client and create their first project to get started."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((p) => (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="rounded-xl border border-border bg-background p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display font-semibold tracking-tight">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.clients?.name ?? "Client"}</div>
                </div>
                <ProjectStatusBadge status={p.status} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description ?? "No description"}</p>
              <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                <span>{p.taskCount} tasks</span>
                <span>{p.pending} pending approval</span>
                <span className="ml-auto">Created {formatDate(p.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
