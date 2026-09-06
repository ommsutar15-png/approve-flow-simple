import type { Database } from "@/integrations/supabase/types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type ContentType = Database["public"]["Enums"]["content_type"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  draft: "Draft",
  internal_review: "Internal Review",
  awaiting_client: "Awaiting Client",
  changes_requested: "Changes Requested",
  approved: "Approved",
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "draft",
  "internal_review",
  "awaiting_client",
  "changes_requested",
  "approved",
];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  instagram_reel: "Instagram Reel",
  instagram_post: "Instagram Post",
  instagram_carousel: "Instagram Carousel",
  story: "Story",
  youtube_video: "YouTube Video",
  youtube_short: "YouTube Short",
  thumbnail: "Thumbnail",
  ad_creative: "Ad Creative",
  graphic: "Graphic",
  copy: "Copy",
  other: "Other",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

const EVENT_LABELS: Record<string, string> = {
  task_created: "created the task",
  version_uploaded: "uploaded a new version",
  approval_link_created: "requested client approval",
  approval_link_opened: "client opened the approval link",
  comment_added: "added a comment",
  changes_requested: "client requested changes",
  version_approved: "client approved the content",
  task_status_changed: "changed the task status",
  client_created: "added a new client",
  project_created: "created a project",
};

export function describeEvent(eventType: string, metadata: Record<string, unknown> | null): string {
  const base = EVENT_LABELS[eventType] ?? eventType.replace(/_/g, " ");
  const version = metadata && typeof metadata["version_number"] === "number"
    ? ` (Version ${metadata["version_number"] as number})`
    : "";
  const name = metadata && typeof metadata["name"] === "string" ? ` — ${metadata["name"] as string}` : "";
  return `${base}${version}${name}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === "approved") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
