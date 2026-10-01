// Server-only helpers for the public client approval flow.
const BUCKET = "content";

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export type LinkState =
  | { state: "invalid" }
  | { state: "revoked" }
  | { state: "expired" }
  | {
      state: "valid";
      link: { id: string; organization_id: string; task_id: string; version_id: string };
    };

export async function resolveToken(token: string): Promise<LinkState> {
  if (!token || token.length < 20 || token.length > 200) return { state: "invalid" };
  const db = await admin();
  const { data: link } = await db
    .from("approval_links")
    .select("id, organization_id, task_id, version_id, revoked_at, expires_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!link) return { state: "invalid" };
  if (link.revoked_at) return { state: "revoked" };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return { state: "expired" };
  return { state: "valid", link };
}

/** Minimum data the client page needs. Never includes internal notes. */
export async function loadApprovalPayload(link: {
  id: string;
  organization_id: string;
  task_id: string;
  version_id: string;
}) {
  const db = await admin();
  const [{ data: task }, { data: version }, { data: org }, { data: decision }, { data: comments }] =
    await Promise.all([
      db
        .from("tasks")
        .select("title, content_type, due_date, clients(name, company_name), projects(name)")
        .eq("id", link.task_id)
        .single(),
      db
        .from("task_versions")
        .select("version_number, file_path, file_name, file_type, caption")
        .eq("id", link.version_id)
        .single(),
      db.from("organizations").select("name").eq("id", link.organization_id).single(),
      db
        .from("approvals")
        .select("decision, approved_by_name, created_at, feedback_categories, comment_id")
        .eq("version_id", link.version_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("comments")
        .select("id, body, author_name, created_at")
        .eq("version_id", link.version_id)
        .eq("author_type", "client")
        .order("created_at", { ascending: true }),
    ]);
  if (!task || !version) return null;

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(version.file_path, 900);
  const feedback = decision?.comment_id ? comments?.find((c) => c.id === decision.comment_id) : null;

  return {
    agencyName: org?.name ?? "Your agency",
    clientName: task.clients?.name ?? null,
    projectName: task.projects?.name ?? null,
    title: task.title,
    contentType: task.content_type,
    dueDate: task.due_date,
    version: {
      number: version.version_number,
      fileName: version.file_name,
      fileType: version.file_type,
      caption: version.caption,
      url: signed?.signedUrl ?? null,
    },
    decision: decision
      ? {
          decision: decision.decision,
          by: decision.approved_by_name,
          at: decision.created_at,
          categories: decision.feedback_categories,
          feedback: feedback?.body ?? null,
        }
      : null,
    comments: (comments ?? []).map((c) => ({ body: c.body, by: c.author_name, at: c.created_at })),
  };
}

export async function touchLink(linkId: string, orgId: string, taskId: string) {
  const db = await admin();
  const { data } = await db.from("approval_links").select("access_count").eq("id", linkId).single();
  await db
    .from("approval_links")
    .update({ access_count: (data?.access_count ?? 0) + 1, last_accessed_at: new Date().toISOString() })
    .eq("id", linkId);
  await db.from("activity_logs").insert({
    organization_id: orgId,
    task_id: taskId,
    actor_type: "client",
    event_type: "approval_link_opened",
    metadata: {},
  });
}

export type RevisionSummary = {
  summary: string;
  points: { area: string; action: string; priority: "high" | "medium" | "low" }[];
};

/**
 * Turns free-text client feedback into actionable revision points.
 * Streams from the AI Gateway and returns the final parsed result, or null on any failure
 * (the client's decision is always saved regardless).
 */
export async function summarizeFeedback(input: {
  feedback: string;
  categories: string[];
  title: string;
  contentType: string;
  caption: string | null;
}): Promise<RevisionSummary | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  const prompt = [
    `Content: "${input.title}" (${input.contentType}).`,
    input.caption ? `Caption shared with client: ${input.caption}` : "",
    input.categories.length ? `Client-tagged areas: ${input.categories.join(", ")}` : "",
    `Client feedback:\n"""${input.feedback}"""`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        instructions:
          "You help a creative agency act on client feedback. Convert the feedback into a short neutral summary (max 2 sentences) and 1-8 concrete, actionable revision points for designers/editors/copywriters. Only use what the client said; never invent requests. Respond with JSON only: {\"summary\": string, \"points\": [{\"area\": \"Design\"|\"Video\"|\"Copy\"|\"Music\"|\"Other\", \"action\": string, \"priority\": \"high\"|\"medium\"|\"low\"}]}",
        input: prompt,
      }),
    });
    if (!res.ok || !res.body) {
      console.error("AI summary failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const evt = JSON.parse(raw);
          if (evt.type === "response.output_text.delta") text += evt.delta ?? "";
        } catch {
          /* partial frame */
        }
      }
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as RevisionSummary;
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.points)) return null;
    return {
      summary: parsed.summary.slice(0, 600),
      points: parsed.points.slice(0, 8).map((p) => ({
        area: String(p.area ?? "Other"),
        action: String(p.action ?? "").slice(0, 300),
        priority: ["high", "medium", "low"].includes(p.priority) ? p.priority : "medium",
      })),
    };
  } catch (e) {
    console.error("AI summary error", e);
    return null;
  }
}

export async function recordDecision(
  link: { id: string; organization_id: string; task_id: string; version_id: string },
  body: { decision: "approved" | "changes_requested"; name: string; email: string | null; feedback: string | null; categories: string[] },
) {
  const db = await admin();
  const { data: task } = await db
    .from("tasks")
    .select("id, client_id, title, content_type, current_version_id")
    .eq("id", link.task_id)
    .single();
  if (!task) return { error: "Task not found", status: 404 };
  if (task.current_version_id && task.current_version_id !== link.version_id)
    return { error: "A newer version has been shared. Please use the latest approval link.", status: 409 };

  const { data: existing } = await db
    .from("approvals")
    .select("id, decision")
    .eq("version_id", link.version_id)
    .limit(1)
    .maybeSingle();
  if (existing) return { error: "A decision has already been recorded for this version.", status: 409 };

  const { data: version } = await db
    .from("task_versions")
    .select("version_number, caption")
    .eq("id", link.version_id)
    .single();

  let commentId: string | null = null;
  if (body.feedback) {
    const { data: c, error } = await db
      .from("comments")
      .insert({
        organization_id: link.organization_id,
        task_id: link.task_id,
        version_id: link.version_id,
        author_type: "client",
        author_name: body.name,
        author_email: body.email,
        body: body.feedback,
      })
      .select("id")
      .single();
    if (error) return { error: "Could not save feedback", status: 500 };
    commentId = c.id;
  }

  const { data: approval, error: apErr } = await db
    .from("approvals")
    .insert({
      organization_id: link.organization_id,
      task_id: link.task_id,
      version_id: link.version_id,
      client_id: task.client_id,
      approval_link_id: link.id,
      decision: body.decision,
      comment_id: commentId,
      approved_by_name: body.name,
      approved_by_email: body.email,
      feedback_categories: body.categories,
    })
    .select("id")
    .single();
  if (apErr || !approval) return { error: "A decision has already been recorded for this version.", status: 409 };

  const approved = body.decision === "approved";
  await db
    .from("tasks")
    .update({
      status: approved ? "approved" : "changes_requested",
      completed_at: approved ? new Date().toISOString() : null,
    })
    .eq("id", link.task_id);
  await db.from("activity_logs").insert({
    organization_id: link.organization_id,
    task_id: link.task_id,
    actor_type: "client",
    event_type: approved ? "version_approved" : "changes_requested",
    metadata: { version_number: version?.version_number, name: body.name },
  });

  if (!approved && body.feedback) {
    const summary = await summarizeFeedback({
      feedback: body.feedback,
      categories: body.categories,
      title: task.title,
      contentType: task.content_type,
      caption: version?.caption ?? null,
    });
    if (summary) await db.from("approvals").update({ ai_summary: summary }).eq("id", approval.id);
  }
  return { ok: true as const };
}
