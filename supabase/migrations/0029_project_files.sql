-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Designs & Documents: folders, files, versions, and one comment thread
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §9.1, frames `104742` (browser) and `104841` (viewer). The owner spent
-- more words on this module than any other.
--
-- ⚠ THE RULE THAT SHAPES EVERY TABLE HERE: A FOLDER BELONGS TO EXACTLY ONE
--   PROJECT. The owner, explicitly: *"if projects are increasing there should be
--   independent folders — project 1 and project 2 can't share the same
--   folders."*
--
--   So `project_id` is NOT NULL on folders and on files, the uniqueness of a
--   folder name is scoped `(project_id, name)` — two projects may each have a
--   "2D" folder and they are different rows — and the storage path itself
--   embeds the project (`<org_id>/<project_id>/<file_id>/…`). Isolation is
--   therefore enforced three times over: by the FK, by the index, and by the
--   physical location of the bytes. A bug in one still leaves two.
--
-- TWO INDEPENDENT LIFECYCLES ON ONE FILE (`104742`'s structural insight):
--   `internal_status`  — draft | approved            (what WE think of it)
--   `client_approval`  — not_shared | no_action |
--                        revision_requested | approved  (what the CLIENT thinks)
--   They are separate columns because they answer different questions, and
--   collapsing them loses the state "we approved it internally but have not
--   shown the client yet", which is most of a design's life.
--
-- VERSIONS are rows, not overwrites. A file's bytes are never replaced: adding
-- a version adds a row and moves the pointer, so "what did the client approve
-- in March" stays answerable.
--
-- `entity_comments` is the shared thread from PLAN-V4 §3 — it serves files
-- (104841), site photos (105527) and orders (105927). Keyed by
-- (entity_type, entity_id) so no module needs its own comment table.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Folders, per project ────────────────────────────────────────────────────
create table if not exists public.project_folders (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  -- NOT NULL: a folder without a project is a folder two projects could share.
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  -- Scoped to the project, never to the org: "2D" may exist once per project.
  unique (project_id, name)
);

-- ── Files ───────────────────────────────────────────────────────────────────
create table if not exists public.project_files (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  -- Null = loose in the project's root, not "shared across projects".
  folder_id       uuid references public.project_folders(id) on delete set null,

  name            text not null,
  description     text,

  internal_status text not null default 'draft',       -- draft | approved
  client_approval text not null default 'not_shared',  -- not_shared | no_action | revision_requested | approved

  current_version int not null default 1,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Versions — rows, never overwrites ───────────────────────────────────────
create table if not exists public.project_file_versions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  file_id      uuid not null references public.project_files(id) on delete cascade,
  version_no   int not null,

  -- '<org_id>/<project_id>/<file_id>/v<n>-<name>' in the private bucket. The
  -- project is in the path on purpose: even a mis-scoped query cannot hand back
  -- another project's object, because the key does not exist under its prefix.
  storage_path text not null,
  size_bytes   bigint not null default 0,
  mime_type    text,
  note         text,

  uploaded_by  uuid,
  created_at   timestamptz not null default now(),
  unique (file_id, version_no)
);

-- ── The shared comment thread (PLAN-V4 §3) ──────────────────────────────────
create table if not exists public.entity_comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,

  -- 'project_file' | 'site_photo' | 'purchase_order' | …
  entity_type text not null,
  entity_id   uuid not null,

  parent_id   uuid references public.entity_comments(id) on delete cascade,
  -- Two threads on one object; a client must never see the internal one.
  audience    text not null default 'internal',   -- internal | client
  status      text not null default 'open',       -- open | accepted | not_required

  body        text not null,
  -- Comments are scoped to the version they were written against.
  version_id  uuid references public.project_file_versions(id) on delete set null,

  -- Where the pin sits on the document. Modelled from day one even while the
  -- first release renders pins in a list.
  page        int,
  x           numeric(6,3),
  y           numeric(6,3),

  author_id   uuid references public.org_members(id) on delete set null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_project_folders_org_project
  on public.project_folders(org_id, project_id, name);
create index if not exists idx_project_files_org_project
  on public.project_files(org_id, project_id, created_at desc);
create index if not exists idx_project_files_folder
  on public.project_files(org_id, folder_id);
create index if not exists idx_project_file_versions_file
  on public.project_file_versions(org_id, file_id, version_no desc);
create index if not exists idx_entity_comments_entity
  on public.entity_comments(org_id, entity_type, entity_id, created_at);
create index if not exists idx_entity_comments_version
  on public.entity_comments(org_id, version_id);
