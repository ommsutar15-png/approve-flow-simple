# ApproveFlow roadmap

## Step 1 — Foundation (in progress)
- [x] Cloud backend enabled
- [x] Schema: organizations, profiles, organization_members, clients, projects, tasks, task_versions, approval_links, comments, approvals, activity_logs
- [x] Enums, FKs, indexes, constraints, updated_at triggers, signup trigger
- [x] Multi-tenant RLS + authorization helper functions
- [x] Auth UI: signup, login, logout, reset password
- [x] Protected app shell: sidebar, top nav, user menu
- [x] Placeholder pages: Dashboard, Clients, Projects, Tasks, Approvals, Activity, Settings
- [x] Verify relationships, RLS, cross-org isolation, security scan

## Step 2 — Agency workflow (in progress)
- [ ] Fix sign-up HTTP 530 error
- [x] Clients, projects, tasks, task detail, version upload, approval links
- [x] Approvals page, activity page
- [ ] End-to-end test

## Later steps
- Clients & projects CRUD
- Tasks list/detail with filters
- Version upload + private storage bucket + signed previews
- Approval links (hashed tokens, server-side validation)
- Public /approve/$token client experience
- Dashboard metrics, approvals view, activity feed
- Realtime on task status, comments, activity
