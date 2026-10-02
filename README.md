# Creative Approval Hub

I want to build a SaaS web application called "ApproveFlow".

PRODUCT:
ApproveFlow is a client approval and content review platform specifically for social media agencies, marketing agencies, freelancers, video editors, designers and content creators.

The main problem:
Creative teams currently send content through WhatsApp, email, Google Drive and scattered messages. Clients give feedback in different places, revisions become confusing, and agencies don't have a reliable record of what was approved.

The core product promise:
"Send content. Get clear approval. Keep every revision and decision in one place."

IMPORTANT:
This is NOT a generic project management tool.
The product should be designed around the creative approval workflow.

PRIMARY WORKFLOW:

Agency creates client
→ creates project
→ creates content task
→ uploads first content version
→ sends client approval link
→ client opens link without creating an account
→ client views content
→ client can approve OR request changes
→ if approved, task becomes Approved and approval is recorded
→ if changes requested, feedback is recorded and task becomes Changes Requested
→ agency uploads a new version
→ client receives a new approval request
→ complete version and approval history remain visible.

TARGET USERS:

Agency Owner/Admin

Account Manager

Creator/Designer/Editor

Client

MVP CLIENT EXPERIENCE:
The client should NOT need to create an account.

The client receives a secure URL such as:

/approve/[secure-token]

The page should show only the specific content/task they were invited to review.

The client should be able to:

View the content

See project/client name

See content title

See version number

See caption/copy if provided

See due date

Add a comment

Approve

Request Changes

If Request Changes is selected:

Open a feedback modal

Require a feedback comment

Optionally allow selecting feedback categories:
Design
Video
Copy
Music
Other

Submit feedback

Change task status to Changes Requested

Record the exact version that received the feedback

Record timestamp

Record approval-link identity/session information where appropriate

If Approve is selected:

Show confirmation

Record approved version

Record timestamp

Record client name/email if provided

Change task status to Approved

Prevent accidental duplicate approvals

Keep the approval record permanently in activity history.

AGENCY DASHBOARD:

The agency dashboard should have:

Sidebar:

Dashboard

Clients

Projects

Tasks

Approvals

Activity

Settings

Dashboard should show:

Total active tasks

Awaiting client approval

Changes requested

Approved

Overdue

Recently approved

Add a clear "Awaiting Approval" section because this is the most important operational view.

TASK LIST:
Each task should show:

Content title

Client

Project

Assigned creator

Current status

Current version

Due date

Last activity

Approval state

Provide filters:

All

Draft

Internal Review

Awaiting Client

Changes Requested

Approved

Overdue

CLIENT MANAGEMENT:
Agency users can:

Create client

Edit client

Archive client

View client projects

View approval history

View pending approvals

CLIENT fields:

id

organization_id

name

company_name

email

phone

avatar

created_at

updated_at

archived_at

PROJECTS:
Each client can have multiple projects.

Project fields:

id

organization_id

client_id

name

description

status

created_at

updated_at

TASKS:
Each project can have multiple tasks.

Task fields:

id

organization_id

client_id

project_id

title

description

content_type

status

assigned_to

due_date

created_by

current_version_id

created_at

updated_at

completed_at

Content types:

Instagram Reel

Instagram Post

Instagram Carousel

Story

YouTube Video

YouTube Short

Thumbnail

Ad Creative

Graphic

Copy

Other

VERSIONS:
A task must support multiple content versions.

Version fields:

id

task_id

version_number

file_path

file_name

file_type

file_size

caption

notes

uploaded_by

created_at

RULE:
Never overwrite an existing version.

If a creator uploads a revised file, create Version 2, Version 3, etc.

APPROVAL LINKS:
Create a separate approval-link system.

An approval link should contain:

id

task_id

version_id

token_hash

expires_at

created_at

revoked_at

last_accessed_at

access_count

Do NOT store the raw approval token in the database.

Generate a cryptographically secure random token.
Store only a secure hash of the token.
Use a server-side Edge Function to validate the token.

The approval link should only expose the specific task/version it belongs to.

Do NOT allow a client approval token to browse:

Other clients

Other projects

Other tasks

Agency dashboard

Internal notes

Other files

COMMENTS:
Comments should belong to a task version.

Fields:

id

task_id

version_id

author_type

author_user_id nullable

author_name

author_email

body

created_at

AUTHOR TYPES:

agency

client

APPROVALS:
Create a dedicated approvals table.

Fields:

id

task_id

version_id

client_id

decision

comment_id nullable

approved_by_name

approved_by_email

created_at

Decision values:

approved

changes_requested

ACTIVITY LOG:
Record important events.

Examples:

Task created

Version uploaded

Approval link created

Approval link opened

Comment added

Changes requested

Version approved

Task status changed

Client reminder sent

Fields:

id

organization_id

task_id

actor_type

actor_id nullable

event_type

metadata JSONB

created_at

ORGANIZATION / MULTI-TENANCY:

This must be a multi-tenant SaaS architecture.

Every agency is an organization.

Users belong to an organization.

All agency-owned records must contain organization_id.

An agency user must NEVER be able to read or modify another organization's data.

Use Supabase PostgreSQL Row Level Security.

RLS must be enabled on all sensitive exposed tables.

Do not rely on frontend checks for authorization.

All authorization must be enforced by Supabase RLS and server-side Edge Functions.

SUPABASE:
Use Supabase for:

PostgreSQL database

Authentication

Storage

Row Level Security

Edge Functions

MEDIA STORAGE:
Use a PRIVATE Supabase Storage bucket for agency content.

Do not use public media URLs for client content.

Use controlled access/signed URLs or server-side authorization for client previews.

Keep the storage path organized by organization/project/task/version.

Example:

organizations/{organization_id}/projects/{project_id}/tasks/{task_id}/versions/{version_id}/file

The UI should support:

Image preview

Video preview for supported browser formats

PDF preview where practical

File download where appropriate

If a file cannot be previewed in-browser, show a clean download action.

SECURITY:
Security is a first-class requirement.

Never put Supabase service-role keys or API secrets in frontend code.

Never trust frontend role checks.

Never expose internal notes to clients.

Never expose another client's content through an approval link.

Validate all mutations server-side where appropriate.

Use RLS for organization-level access control.

Use Edge Functions for sensitive public approval-link operations.

Do not allow a client to modify task status directly through a public database query.

PUBLIC APPROVAL FLOW:

GET /approve/:token

The server validates token.

If invalid:
Show "This approval link is invalid."

If revoked:
Show "This approval link is no longer active."

If expired:
Show "This approval link has expired."

If valid:
Return only the minimum information needed for the approval page.

Client can:

view current version

comment

approve

request changes

Approval mutation must happen through a secure server-side function.

After approval:
Show:
"Approved successfully"

Show:

Approved version

Date/time

Client name

After change request:
Show:
"Changes requested"

Show submitted feedback.

Do not require client account creation for this flow.

AGENCY AUTHENTICATION:

Use Supabase Auth.

Agency users can:

Sign up

Log in

Log out

Reset password

For MVP, use email/password authentication.

Create profiles linked to auth.users.

Roles:

owner

admin

member

Do not create complex permission management yet.

DESIGN DIRECTION:

The UI should feel like a premium modern SaaS product for creative agencies.

Not like a generic CRM.

Design characteristics:

Minimal

Premium

Clean

Professional

Fast

Content-first

Lots of whitespace

Strong typography

Subtle borders

Subtle shadows

Rounded cards

Clear status badges

Excellent empty states

Excellent loading states

Excellent error states

Use a neutral professional base palette with one strong accent color.

Avoid excessive gradients.
Avoid excessive glassmorphism.
Avoid unnecessary animations.

Desktop-first but fully responsive.

The client approval page should be especially polished because it is the most important customer-facing experience.

IMPORTANT PRODUCT PRINCIPLE:

The agency dashboard can be complex.

The client approval experience must be extremely simple.

Client should understand what to do within 5 seconds.

PRIMARY CTA:
"Approve"

SECONDARY CTA:
"Request Changes"

Do not bury these actions.

DATABASE:
Before implementing the application, create a clean relational schema with appropriate foreign keys, indexes and constraints.

Use UUID primary keys.

Use timestamps.

Use enums/check constraints where appropriate.

Add indexes for:

organization_id

client_id

project_id

task_id

status

due_date

created_at

Prevent duplicate version numbers for the same task.

Prevent duplicate active approval decisions for the same version where appropriate.

Do not duplicate data unnecessarily.

ARCHITECTURE:
Use reusable components.

Separate:

UI components

data access

authentication

business logic

Edge Functions

Do not put business-critical authorization logic only in React components.

REALTIME:
Use Supabase realtime only where it adds real value, such as:

task status updates

comments

dashboard activity

Do not add realtime everywhere unnecessarily.

MVP OUT OF SCOPE:

Do NOT build these yet:

WhatsApp integration

Instagram API

Facebook API

YouTube API

Social media publishing

AI content generation

AI feedback analysis

Billing/subscriptions

Advanced analytics

CRM

Invoicing

Calendar integrations

Slack integration

Zapier/Make integration

White-labeling

Advanced team permissions

These may be added later.

SUCCESS CRITERIA:

A complete MVP should allow this exact test:

Agency user signs up.

Agency creates a client called "FarmerLift".

Agency creates project "September Social Media".

Agency creates task "September Reel 01".

Agency assigns it to a creator.

Creator uploads Version 1.

Agency creates an approval link.

Client opens the link without logging in.

Client watches the video.

Client requests changes with a comment.

Agency sees "Changes Requested".

Creator uploads Version 2.

Agency sends a new approval link.

Client opens Version 2.

Client approves.

Agency sees "Approved".

Activity history shows Version 1 feedback and Version 2 approval.

Version 1 remains unchanged.

Client cannot access any other agency/client/project/task.

Agency user cannot access another organization's data.

Before writing application code, analyze this architecture and identify any contradictions, security risks, missing relationships or implementation problems.

DO NOT BUILD THE WHOLE APPLICATION YET.

First give me:

Proposed database schema

User roles and permissions

Route structure

Edge Functions required

Storage architecture

Approval-link security design

RLS strategy

MVP build order

Any decisions you need me to make

Ask me questions only where a decision materially affects the architecture.
Otherwise make sensible MVP assumptions and clearly state them.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://approve-flow-simple.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9e9dbb4f-9986-4f17-b18c-56af8e64742f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
