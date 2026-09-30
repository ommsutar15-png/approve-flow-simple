import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, EmptyState, LoadingRows } from "@/components/app/PageHeader";
import { StatusBadge, OverdueBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { useTasksOverview } from "@/lib/tasks-overview";
import { formatDate, formatDateTime, isOverdue, type TaskStatus } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals | ApproveFlow" },
      { name: "description", content: "Content awaiting clients, changes requested and recent approvals." },
      { property: "og:title", content: "Approvals | ApproveFlow" },
      { property: "og:description", content: "Content awaiting clients, changes requested and recent approvals." },
    ],
  }),
  component: ApprovalsPage,
});

const SECTIONS: { status: TaskStatus; title: string; empty: string }[] = [
  { status: "awaiting_client", title: "Awaiting Client", empty: "Nothing is waiting on a client." },
  { status: "changes_requested", title: "Changes Requested", empty: "No open change requests." },
  { status: "approved", title: "Recently Approved", empty: "No approvals yet." },
];

type Filter = "all" | TaskStatus;

function ApprovalsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading } = useTasksOverview();

  return (
    <section className="space-y-8">
      <PageHeader title="Approvals" description="Where every piece of content stands with the client." />
      <div className="flex flex-wrap gap-2">
        {[{ value: "all" as Filter, label: "All" }, ...SECTIONS.map((s) => ({ value: s.status as Filter, label: s.title }))].map(
          (f) => (
            <Button
              key={f.value}
              size="sm"
              className="rounded-full"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ),
        )}
      </div>

      {isLoading ? (
        <LoadingRows />
      ) : (
        SECTIONS.filter((s) => filter === "all" || filter === s.status).map((s) => {
          const items = (data ?? []).filter((t) => t.status === s.status).slice(0, s.status === "approved" ? 12 : 100);
          return (
            <div key={s.status} className="space-y-3">
              <h3 className="font-display text-lg font-semibold tracking-tight">
                {s.title} <span className="text-sm font-normal text-muted-foreground">{items.length}</span>
              </h3>
              {!items.length ? (
                <EmptyState title={s.empty} description="Items appear here as clients respond." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((t) => (
                    <Link
                      key={t.id}
                      to="/tasks/$taskId"
                      params={{ taskId: t.id }}
                      className="rounded-xl border border-border bg-background p-5 transition-shadow hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{t.title}</div>
                          <div className="text-xs text-muted-foreground">{t.clients?.name}</div>
                        </div>
                        <div className="flex gap-2">
                          {isOverdue(t.due_date, t.status) ? <OverdueBadge /> : null}
                          <StatusBadge status={t.status} />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <span>{t.currentVersion ? `Version ${t.currentVersion}` : "No version"}</span>
                        <span>Due {formatDate(t.due_date)}</span>
                        <span>Last activity {formatDateTime(t.lastActivity?.created_at ?? t.updated_at)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
