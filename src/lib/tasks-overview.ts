import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

