import { cn } from "@/lib/utils";
import { TASK_STATUS_LABELS, PROJECT_STATUS_LABELS, type TaskStatus, type ProjectStatus } from "@/lib/labels";

const TASK_STYLES: Record<TaskStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  internal_review: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  awaiting_client: "bg-primary/10 text-primary border-primary/25",
  changes_requested: "bg-destructive/10 text-destructive border-destructive/25",
  approved: "bg-chart-2/15 text-chart-2 border-chart-2/30",
};

const PROJECT_STYLES: Record<ProjectStatus, string> = {
  active: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  paused: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  completed: "bg-primary/10 text-primary border-primary/25",
  archived: "bg-muted text-muted-foreground border-border",
};

const base =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <span className={cn(base, TASK_STYLES[status], className)}>{TASK_STATUS_LABELS[status]}</span>;
}

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return <span className={cn(base, PROJECT_STYLES[status], className)}>{PROJECT_STATUS_LABELS[status]}</span>;
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "bg-destructive/10 text-destructive border-destructive/25", className)}>
      Overdue
    </span>
  );
}
