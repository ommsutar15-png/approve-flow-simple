import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "content";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
}

/** Returns a short-lived signed URL the browser can PUT the file to. */
export const createVersionUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { taskId: string; fileName: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: task, error } = await context.supabase
      .from("tasks")
      .select("id, organization_id, project_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task) throw new Error("Task not found");

    const path = `organizations/${task.organization_id}/projects/${task.project_id}/tasks/${task.id}/versions/${crypto.randomUUID()}/${safeName(data.fileName)}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signError || !signed) throw new Error("Could not prepare the upload");

    return { path, signedUrl: signed.signedUrl, token: signed.token };
  });

/** Records the uploaded file as the next immutable version of a task. */
export const finalizeVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      taskId: string;
      filePath: string;
      fileName: string;
      fileType?: string | null;
      fileSize?: number | null;
      caption?: string | null;
      notes?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, organization_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task) throw new Error("Task not found");

    const { data: last } = await supabase
      .from("task_versions")
      .select("version_number")
      .eq("task_id", task.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const versionNumber = (last?.version_number ?? 0) + 1;

    const { data: version, error: insertError } = await supabase
      .from("task_versions")
      .insert({
        organization_id: task.organization_id,
        task_id: task.id,
        version_number: versionNumber,
        file_path: data.filePath,
        file_name: data.fileName,
        file_type: data.fileType ?? null,
        file_size: data.fileSize ?? null,
        caption: data.caption ?? null,
        notes: data.notes ?? null,
        uploaded_by: userId,
      })
      .select("id, version_number")
      .single();
    if (insertError || !version) throw new Error(insertError?.message ?? "Could not save the version");

    await supabase.from("tasks").update({ current_version_id: version.id }).eq("id", task.id);
    await supabase.from("activity_logs").insert({
      organization_id: task.organization_id,
      task_id: task.id,
      actor_type: "agency",
      actor_id: userId,
      event_type: "version_uploaded",
      metadata: { version_number: version.version_number, name: data.fileName },
    });

    return { versionId: version.id, versionNumber: version.version_number };
  });

/** Signed preview URL for an agency user, scoped by their org through RLS. */
export const getVersionFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { versionId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: version, error } = await context.supabase
      .from("task_versions")
      .select("file_path")
      .eq("id", data.versionId)
      .maybeSingle();
    if (error || !version) throw new Error("Version not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(version.file_path, 900);
    if (signError || !signed) throw new Error("Could not create a preview link");
    return { url: signed.signedUrl };
  });

/** Creates a hashed approval token for one task/version pair. */
export const createApprovalLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { taskId: string; versionId: string; recipientEmail?: string | null; expiresInDays?: number }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, organization_id, status")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task) throw new Error("Task not found");

    const { data: version } = await supabase
      .from("task_versions")
      .select("id, version_number")
      .eq("id", data.versionId)
      .eq("task_id", task.id)
      .maybeSingle();
    if (!version) throw new Error("Version not found");

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const days = data.expiresInDays && data.expiresInDays > 0 ? data.expiresInDays : 14;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    const { error: linkError } = await supabase.from("approval_links").insert({
      organization_id: task.organization_id,
      task_id: task.id,
      version_id: version.id,
      token_hash: tokenHash,
      recipient_email: data.recipientEmail || null,
      expires_at: expiresAt,
      created_by: userId,
    });
    if (linkError) throw new Error(linkError.message);

    await supabase.from("tasks").update({ status: "awaiting_client" }).eq("id", task.id);
    await supabase.from("activity_logs").insert({
      organization_id: task.organization_id,
      task_id: task.id,
      actor_type: "agency",
      actor_id: userId,
      event_type: "approval_link_created",
      metadata: { version_number: version.version_number },
    });

    return { token: rawToken, expiresAt, versionNumber: version.version_number };
  });
