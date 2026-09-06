# ApproveFlow — Architecture Plan (no code yet)

A client approval and content review platform for creative agencies. This document covers schema, permissions, routes, server logic, storage, approval-link security, RLS, and build order.

## Architecture corrections to your brief

1. **No Supabase Edge Functions.** This project runs on TanStack Start, which already has a server runtime. All sensitive public approval-link logic runs as server routes (`/api/public/*`) and server functions — same security properties (service-role key stays server-side), fewer moving parts.
2. **`author_type` on comments is not trustworthy from the client.** It gets set server-side from how the write arrived (authenticated agency session vs. approval token), never from request body.
3. **Client-side approvals never touch the database directly.** The public approval page reads and writes only through token-validated server endpoints. The `anon` role gets zero policies on agency tables.
4. **"Prevent duplicate active approval decisions"** — one decision per (version, approval link) enforced by a unique index, plus a status guard: once a version is `approved`, further decisions on it are rejected.
5. **Organization membership** must be resolved by a `SECURITY DEFINER` function, not a subquery on the members table inside its own policy (infinite recursion otherwise).
6. **Realtime scope**: task status + comments on a task detail page, and the dashboard activity feed. Nothing else.

## Database schema

UUID primary keys, `timestamptz` timestamps, Postgres enums, FKs with sensible cascade rules.

Enums: `app_role` (owner, admin, member) · `project_status` (active, paused, completed, archived) · `task_status` (draft, internal_review, awaiting_client, changes_requested, approved) · `content_type` (11 values from the brief) · `author_type` (agency, client) · `decision` (approved, changes_requested) · `actor_type` (agency, client, system).

Tables:

- **organizations** — id, name, slug, created_at, updated_at
- **profiles** — id (= auth.users.id), organization_id, full_name, email, avatar_url, timestamps
- **organization_members** — id, organization_id, user_id, role (app_role), unique (organization_id, user_id). Roles live here, never on profiles.
- **clients** — id, organization_id, name, company_name, email, phone, avatar_url, created_at, updated_at, archived_at
- **projects** — id, organization_id, client_id, name, description, status, timestamps
- **tasks** — id, organization_id, client_id, project_id, title, description, content_type, status, assigned_to, due_date, created_by, current_version_id, created_at, updated_at, completed_at
- **task_versions** — id, task_id, organization_id, version_number, file_path, file_name, file_type, file_size, caption, notes (internal, never sent to clients), uploaded_by, created_at. Unique (task_id, version_number). Insert-only: no update/delete policy, so versions can never be overwritten.
- **approval_links** — id, task_id, version_id, organization_id, token_hash (unique), expires_at, created_at, revoked_at, last_accessed_at, access_count, recipient_email
- **comments** — id, task_id, version_id, organization_id, author_type, author_user_id, author_name, author_email, body, created_at
- **approvals** — id, task_id, version_id, client_id, organization_id, approval_link_id, decision, comment_id, feedback_categories text[], approved_by_name, approved_by_email, created_at
- **activity_log** — id, organization_id, task_id, actor_type, actor_id, event_type, metadata jsonb, created_at

`organization_id` is denormalized onto child tables deliberately — it makes every RLS policy a single indexed equality check instead of a join chain.

Indexes: organization_id on every tenant table; client_id, project_id, task_id, version_id on their children; tasks(status), tasks(due_date), tasks(organization_id, status); activity_log(organization_id, created_at desc); approval_links(token_hash).

Constraints: unique (task_id, version_number); unique partial index on approvals(version_id) where decision = 'approved'; check that `completed_at` is set only when status = approved; `current_version_id` FK to task_versions, deferred/nullable.

Grants: every new public table gets explicit GRANTs to `authenticated` and `service_role`. No `anon` grants anywhere.

## Roles and permissions

| Capability | owner | admin | member (creator) |
|---|---|---|---|
| Manage org settings, invite/remove members | yes | no | no |
| Create/edit/archive clients & projects | yes | yes | no |
| Create/edit any task | yes | yes | own/assigned only |
| Upload versions | yes | yes | yes |
| Create/revoke approval links | yes | yes | yes |
| Delete client/project | yes | no | no |

Checked via a `has_org_role(_user_id, _org_id, _role)` SECURITY DEFINER function used in RLS policies, not in React.

## Route structure

Public:
- `/` marketing landing
- `/auth` sign in / sign up / reset password
- `/approve/$token` client approval page (SSR, no account required)

Agency (under `_authenticated/`, gated by the managed layout):
- `/app` dashboard
- `/app/clients`, `/app/clients/$clientId`
- `/app/projects`, `/app/projects/$projectId`
- `/app/tasks`, `/app/tasks/$taskId` (version history, comments, approval links)
- `/app/approvals`, `/app/activity`, `/app/settings`

Server endpoints:
- `/api/public/approve/$token` — GET validated payload, POST decision (token in the request, verified server-side)

## Server-side logic (replaces "Edge Functions")

1. `createApprovalLink` — generates a 32-byte random token, stores only its SHA-256 hash, returns the raw token once for copying.
2. `resolveApprovalToken` (public) — hashes the incoming token, looks up the link, checks revoked/expired, increments access_count, logs `approval_link_opened`, and returns a minimal payload: client name, project name, task title, content type, due date, version number, caption, a short-lived signed file URL, and prior client-visible comments. Never internal notes, never sibling tasks.
3. `submitApprovalDecision` (public) — re-validates the token, writes the comment + approval row + task status change + activity entry in one transaction, guards against duplicate approval on an already-approved version.
4. `uploadVersion` — allocates the next version number atomically, writes the storage path, updates `current_version_id`.
5. `signVersionFile` — signed URL for agency previews.

Distinct error states: invalid, revoked, expired, already decided.

## Storage architecture

One **private** bucket `content`. Path: `organizations/{org}/projects/{project}/tasks/{task}/versions/{version}/{filename}`. No public URLs ever. Agency users get signed URLs via RLS-checked policies on `storage.objects` scoped by the org-id path prefix; clients get a short-lived (15 min) signed URL minted only by the token-validated endpoint. Preview: images inline, video via `<video>` for mp4/webm/mov, PDF via embed, everything else falls back to a clean download button.

## Approval-link security design

- Token: 32 random bytes, base64url (~43 chars), shown once at creation.
- Stored as SHA-256 hash; the raw token never lands in the database or logs.
- Scoped to exactly one (task, version) pair — a new version needs a new link.
- Optional expiry (default 14 days) and manual revoke.
- Rate-limited by link: access counting plus rejection of repeat decisions.
- The public page renders server-side from the validated payload; the browser never holds a Supabase key capable of reading agency tables.

## RLS strategy

RLS enabled on every table. All agency policies are `TO authenticated` and shaped as `organization_id = current_org_id()` where `current_org_id()` is a SECURITY DEFINER lookup over `organization_members`. Writes additionally check `has_org_role(...)` for the admin-only operations above. `task_versions` gets no UPDATE or DELETE policy at all. No policy grants anything to `anon`; all client-side approval reads/writes go through the service-role path behind token validation.

## MVP build order

1. Cloud backend + full schema migration, enums, indexes, grants, RLS, helper functions, private bucket.
2. Auth: sign up (creates org + owner membership + profile via trigger), sign in, reset, protected layout.
3. Design system: palette, typography, status badges, empty/loading/error primitives, app shell + sidebar.
4. Clients and projects CRUD.
5. Tasks: list with filters, detail page, assignment.
6. Version upload with signed previews and immutable version history.
7. Approval links: create, copy, revoke.
8. Public `/approve/$token` page — approve, request changes with categories, confirmation states.
9. Dashboard metrics + "Awaiting Approval" section, approvals view, activity feed.
10. Realtime on task status, comments, activity. Then the full FarmerLift end-to-end test.

## Assumptions I'm making

- Sign-up creates a new organization with the signer as owner; teammate invites are a simple email-based invite in settings (not full permission management).
- Email notifications to clients are out of scope for MVP — links are copied and shared manually.
- Approval links default to 14-day expiry, editable at creation.
- Feedback categories are optional multi-select, stored on the approval row.
- Client name/email on the approval page are optional inputs, prefilled from the link recipient when known.

## Decisions I need from you

1. **Client identity on the approval page** — require the client to type their name before approving (better audit trail), or allow anonymous approval?
2. **Link lifetime** — one link per version (strict, my default), or one reusable link per task that always points at the latest version?
3. **Landing page** — build a real marketing home page for ApproveFlow, or make `/` redirect straight to sign-in for MVP?
4. **Accent color** — I'll default to a deep indigo-free, confident blue-violet on warm neutrals unless you want a specific brand color.
