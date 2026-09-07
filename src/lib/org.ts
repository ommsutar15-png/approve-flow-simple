import { supabase } from "@/integrations/supabase/client";

export async function getMyOrgId(): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.organization_id) throw new Error("No organization found for this account");
  return data.organization_id;
}

export async function getMyUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export async function logActivity(input: {
  organizationId: string;
  taskId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const userId = await getMyUserId();
  await supabase.from("activity_logs").insert({
    organization_id: input.organizationId,
    task_id: input.taskId ?? null,
    actor_type: "agency",
    actor_id: userId,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
  });
}
