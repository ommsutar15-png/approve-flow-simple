import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { loadApprovalPayload, recordDecision, resolveToken, touchLink } from "@/lib/approval.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const Decision = z
  .object({
    decision: z.enum(["approved", "changes_requested"]),
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200).nullable().optional(),
    feedback: z.string().trim().max(5000).nullable().optional(),
    categories: z.array(z.enum(["Design", "Video", "Copy", "Music", "Other"])).max(5).default([]),
  })
  .refine((d) => d.decision === "approved" || (d.feedback && d.feedback.length > 0), {
    message: "Feedback is required when requesting changes",
  });

export const Route = createFileRoute("/api/public/approve/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const r = await resolveToken(params.token);
        if (r.state !== "valid") return json({ state: r.state });
        const payload = await loadApprovalPayload(r.link);
        if (!payload) return json({ state: "invalid" });
        if (new URL(request.url).searchParams.get("visit") === "1")
          await touchLink(r.link.id, r.link.organization_id, r.link.task_id);
        return json({ state: "valid", ...payload });
      },
      POST: async ({ params, request }) => {
        const r = await resolveToken(params.token);
        if (r.state !== "valid") return json({ error: "This approval link is not active." }, 403);
        const parsed = Decision.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
        const d = parsed.data;
        const result = await recordDecision(r.link, {
          decision: d.decision,
          name: d.name,
          email: d.email || null,
          feedback: d.feedback || null,
          categories: d.categories,
        });
        if ("error" in result) return json({ error: result.error }, result.status);
        return json({ ok: true });
      },
    },
  },
});
