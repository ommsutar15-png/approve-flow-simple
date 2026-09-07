import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/app/PageHeader";
import { StatusBadge, OverdueBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  CONTENT_TYPE_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  formatDate,
  formatDateTime,
  isOverdue,
  type TaskStatus,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks/")({
  head: () => ({
    meta: [
      { title: "Tasks | ApproveFlow" },
      { name: "description", content: "Content pieces moving through review and approval." },
      { property: "og:title", content: "Tasks | ApproveFlow" },
      { property: "og:description", content: "Content pieces moving through review and approval." },
    ],
  }),
  component: TasksPage,
});

type Filter = "all" | TaskStatus | "overdue";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...TASK_STATUS_ORDER.map((s) => ({ value: s as Filter, label: TASK_STATUS_LABELS[s] })),
  { value: "overdue", label: "Overdue" },
];

export function useTasksOverview() {
  return useQuery({
    queryKey: ["tasks-overview"],
    queryFn: async () => {
      const [{ data: tasks, error }, { data: versions }, { data: members }, { data: activity }] =
        await Promise.all([
          supabase
            .from("tasks")
            .select(
              "id, title, status, content_type, due_date, updated_at, assigned_to, current_version_id, clients(id, name), projects(id, name)",
            )
            .order("updated_at", { ascending: false }),
          supabase.from("task_versions").select("id, task_id, version_number"),
          supabase.from("profiles").select("id, full_name, email"),
          supabase.from("activity_logs").select("task_id, created_at, event_type").order("created_at", {
            ascending: false,
          }),
        ]);
      if (error) throw error;

      const lastActivity = new Map<string, { created_at: string; event_type: string }>();
      for (const a of activity ?? []) {
        if (a.task_id && !lastActivity.has(a.task_id)) lastActivity.set(a.task_id, a);
      }

      return (tasks ?? []).map((t) => {
        const own = (versions ?? []).filter((v) => v.task_id === t.id);
        const current = own.reduce((max, v) => Math.max(max, v.version_number), 0);
        return {
          ...t,
          versionCount: own.length,
          currentVersion: current,
          assignee:
            (members ?? []).find((m) => m.id === t.assigned_to)?.full_name ??
            (t.assigned_to ? "Team member" : "Unassigned"),
          lastActivity: lastActivity.get(t.id) ?? null,
        };
      });
    },
  });
}

function TasksPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading } = useTasksOverview();

  const tasks = (data ?? []).filter((t) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isOverdue(t.due_date, t.status);
    return t.status === filter;
  });

  return (
    <section className="space-y-6">
      <PageHeader title="Tasks" description="Content pieces moving through review and approval." />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            className={cn("rounded-full", filter === f.value ? "" : "text-muted-foreground")}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows />
      ) : !tasks.length ? (
        <EmptyState
          title="Nothing here"
          description="No tasks match this filter yet. Create content inside a project to see it here."
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Link
              key={t.id}
              to="/tasks/$taskId"
              params={{ taskId: t.id }}
              className="block rounded-xl border border-border bg-background px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.clients?.name} · {t.projects?.name} · {CONTENT_TYPE_LABELS[t.content_type]}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isOverdue(t.due_date, t.status) ? <OverdueBadge /> : null}
                  <StatusBadge status={t.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>{t.assignee}</span>
                <span>{t.currentVersion ? `Version ${t.currentVersion}` : "No version yet"}</span>
                <span>Due {formatDate(t.due_date)}</span>
                <span>Last activity {formatDateTime(t.lastActivity?.created_at ?? t.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
