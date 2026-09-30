import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/app/PageHeader";
import { describeEvent, formatDateTime } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity | ApproveFlow" },
      { name: "description", content: "Every version, comment and decision, in order." },
      { property: "og:title", content: "Activity | ApproveFlow" },
      { property: "og:description", content: "Every version, comment and decision, in order." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      const [{ data: rows, error }, { data: members }] = await Promise.all([
        supabase
          .from("activity_logs")
          .select("id, event_type, metadata, created_at, actor_type, actor_id, task_id, tasks(id, title, clients(name))")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (error) throw error;
      return (rows ?? []).map((r) => ({
        ...r,
        actor:
          r.actor_type === "client"
            ? "Client"
            : r.actor_type === "system"
              ? "System"
              : ((members ?? []).find((m) => m.id === r.actor_id)?.full_name ?? "Team member"),
      }));
    },
  });

  return (
    <section className="space-y-6">
      <PageHeader title="Activity" description="Every version, comment and decision, in order." />
      {isLoading ? (
        <LoadingRows rows={6} />
      ) : !data?.length ? (
        <EmptyState title="No activity yet" description="Actions on clients, tasks and approvals show up here." />
      ) : (
        <ol className="relative space-y-1 rounded-xl border border-border bg-background p-2">
          {data.map((a) => {
            const desc = describeEvent(a.event_type, a.metadata as Record<string, unknown> | null);
            const clientEvent = a.event_type.startsWith("approval_link_opened") || a.event_type === "changes_requested" || a.event_type === "version_approved";
            return (
              <li key={a.id} className="flex items-start gap-4 rounded-lg px-4 py-3 hover:bg-muted/40">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1 text-sm">
                  <p>
                    {clientEvent ? (
                      <span className="capitalize">{desc}</span>
                    ) : (
                      <>
                        <span className="font-medium">{a.actor}</span> {desc}
                      </>
                    )}
                    {a.tasks ? (
                      <>
                        {" on "}
                        <Link to="/tasks/$taskId" params={{ taskId: a.tasks.id }} className="font-medium hover:underline">
                          {a.tasks.title}
                        </Link>
                        <span className="text-muted-foreground"> · {a.tasks.clients?.name}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
