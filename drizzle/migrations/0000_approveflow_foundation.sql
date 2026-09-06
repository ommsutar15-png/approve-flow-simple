-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('owner','admin','member');
CREATE TYPE public.project_status AS ENUM ('active','paused','completed','archived');
CREATE TYPE public.task_status AS ENUM ('draft','internal_review','awaiting_client','changes_requested','approved');
CREATE TYPE public.content_type AS ENUM ('instagram_reel','instagram_post','instagram_carousel','story','youtube_video','youtube_short','thumbnail','ad_creative','graphic','copy','other');
CREATE TYPE public.author_type AS ENUM ('agency','client');
CREATE TYPE public.approval_decision AS ENUM ('approved','changes_requested');
CREATE TYPE public.actor_type AS ENUM ('agency','client','system');

-- =========================
-- CORE TENANT TABLES
-- =========================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_organization_id ON public.profiles(organization_id);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);

-- =========================
-- AUTHORIZATION HELPERS
-- =========================
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = auth.uid() AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = auth.uid() AND role IN ('owner','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================
-- BUSINESS TABLES
-- =========================
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX idx_clients_org ON public.clients(organization_id);
CREATE INDEX idx_clients_created_at ON public.clients(created_at DESC);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status public.project_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_org ON public.projects(organization_id);
CREATE INDEX idx_projects_client ON public.projects(client_id);
CREATE INDEX idx_projects_status ON public.projects(status);
CREATE INDEX idx_projects_created_at ON public.projects(created_at DESC);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  content_type public.content_type NOT NULL DEFAULT 'other',
  status public.task_status NOT NULL DEFAULT 'draft',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT tasks_completed_when_approved CHECK (completed_at IS NULL OR status = 'approved')
);
CREATE INDEX idx_tasks_org ON public.tasks(organization_id);
CREATE INDEX idx_tasks_client ON public.tasks(client_id);
CREATE INDEX idx_tasks_project ON public.tasks(project_id);
CREATE INDEX idx_tasks_status ON public.tasks(organization_id, status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_tasks_created_at ON public.tasks(created_at DESC);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);

CREATE TABLE public.task_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  caption text,
  notes text,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, version_number)
);
CREATE INDEX idx_versions_org ON public.task_versions(organization_id);
CREATE INDEX idx_versions_task ON public.task_versions(task_id);
CREATE INDEX idx_versions_created_at ON public.task_versions(created_at DESC);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.task_versions(id) ON DELETE SET NULL;

CREATE TABLE public.approval_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.task_versions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  recipient_email text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_links_org ON public.approval_links(organization_id);
CREATE INDEX idx_links_task ON public.approval_links(task_id);
CREATE INDEX idx_links_version ON public.approval_links(version_id);

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.task_versions(id) ON DELETE CASCADE,
  author_type public.author_type NOT NULL,
  author_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text,
  author_email text,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_org ON public.comments(organization_id);
CREATE INDEX idx_comments_task ON public.comments(task_id);
CREATE INDEX idx_comments_version ON public.comments(version_id);
CREATE INDEX idx_comments_created_at ON public.comments(created_at DESC);

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.task_versions(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  approval_link_id uuid REFERENCES public.approval_links(id) ON DELETE SET NULL,
  decision public.approval_decision NOT NULL,
  feedback_categories text[] NOT NULL DEFAULT '{}',
  comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL,
  approved_by_name text,
  approved_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_approvals_org ON public.approvals(organization_id);
CREATE INDEX idx_approvals_task ON public.approvals(task_id);
CREATE INDEX idx_approvals_version ON public.approvals(version_id);
CREATE INDEX idx_approvals_client ON public.approvals(client_id);
CREATE INDEX idx_approvals_created_at ON public.approvals(created_at DESC);
CREATE UNIQUE INDEX uniq_approved_per_version ON public.approvals(version_id) WHERE decision = 'approved';

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_type public.actor_type NOT NULL DEFAULT 'agency',
  actor_id uuid,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_org ON public.activity_logs(organization_id, created_at DESC);
CREATE INDEX idx_activity_task ON public.activity_logs(task_id);

-- updated_at triggers
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- SIGNUP TRIGGER: profile + organization + owner membership
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  org_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'organization_name', ''), 'My Agency');

  INSERT INTO public.organizations (name) VALUES (org_name) RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, organization_id, full_name, email)
  VALUES (NEW.id, new_org_id, NULLIF(NEW.raw_user_meta_data ->> 'full_name',''), NEW.email);

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- GRANTS
-- =========================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;

GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.clients TO service_role;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.tasks TO service_role;
GRANT ALL ON public.task_versions TO service_role;
GRANT ALL ON public.approval_links TO service_role;
GRANT ALL ON public.comments TO service_role;
GRANT ALL ON public.approvals TO service_role;
GRANT ALL ON public.activity_logs TO service_role;

-- =========================
-- RLS
-- =========================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "members read own org" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "owners update own org" ON public.organizations FOR UPDATE TO authenticated USING (public.has_org_role(id,'owner')) WITH CHECK (public.has_org_role(id,'owner'));

-- profiles
CREATE POLICY "read profiles in my org" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_org_member(organization_id));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- organization_members
CREATE POLICY "read members of my org" ON public.organization_members FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "owners manage members" ON public.organization_members FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id,'owner'));
CREATE POLICY "owners update members" ON public.organization_members FOR UPDATE TO authenticated USING (public.has_org_role(organization_id,'owner')) WITH CHECK (public.has_org_role(organization_id,'owner'));
CREATE POLICY "owners delete members" ON public.organization_members FOR DELETE TO authenticated USING (public.has_org_role(organization_id,'owner'));

-- clients
CREATE POLICY "org read clients" ON public.clients FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "managers insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(organization_id));
CREATE POLICY "managers update clients" ON public.clients FOR UPDATE TO authenticated USING (public.can_manage_org(organization_id)) WITH CHECK (public.can_manage_org(organization_id));
CREATE POLICY "owners delete clients" ON public.clients FOR DELETE TO authenticated USING (public.has_org_role(organization_id,'owner'));

-- projects
CREATE POLICY "org read projects" ON public.projects FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "managers insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(organization_id));
CREATE POLICY "managers update projects" ON public.projects FOR UPDATE TO authenticated USING (public.can_manage_org(organization_id)) WITH CHECK (public.can_manage_org(organization_id));
CREATE POLICY "owners delete projects" ON public.projects FOR DELETE TO authenticated USING (public.has_org_role(organization_id,'owner'));

-- tasks
CREATE POLICY "org read tasks" ON public.tasks FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "org insert tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "org update tasks" ON public.tasks FOR UPDATE TO authenticated USING (public.can_manage_org(organization_id) OR assigned_to = auth.uid() OR created_by = auth.uid()) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "managers delete tasks" ON public.tasks FOR DELETE TO authenticated USING (public.can_manage_org(organization_id));

-- task_versions (insert-only; never overwritten)
CREATE POLICY "org read versions" ON public.task_versions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "org insert versions" ON public.task_versions FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

-- approval_links
CREATE POLICY "org read links" ON public.approval_links FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "org insert links" ON public.approval_links FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "org update links" ON public.approval_links FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

-- comments
CREATE POLICY "org read comments" ON public.comments FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "agency insert comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND author_type = 'agency' AND author_user_id = auth.uid());
CREATE POLICY "authors delete own comments" ON public.comments FOR DELETE TO authenticated USING (author_user_id = auth.uid());

-- approvals (client decisions are written server-side only)
CREATE POLICY "org read approvals" ON public.approvals FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- activity_logs
CREATE POLICY "org read activity" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "org insert activity" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
