-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — OPS-DES-001: Design vault + client sign-off (PLAN §6.7)
-- ════════════════════════════════════════════════════════════════════════════
-- Per-project asset repository for the upload-and-approve design flow: 2D
-- plans, 3D models, BOQs, renders, site photos. v1 carries a pasted `url`
-- (link to the drawing/render) + metadata — NO real file storage.
--
-- Reviewers leave `asset_comments` — pin comments carrying x/y percentages of
-- the asset (x_pct/y_pct, 0–100) so feedback is in-context without an image
-- editor. A formal `asset_signoffs` row (pending|approved|rejected + note)
-- gates site execution; rows are append-only history, latest wins.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    All three tables are added to the tenant allowlist in lib/data/tables.ts.
-- Additive migration only; idempotent `create table if not exists`.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  project_label text,                                  -- free-text project tag (v1; projects link comes later)
  name          text not null,
  kind          text not null default '2d',            -- 2d|3d|boq|render|photo|other
  url           text,                                  -- pasted link to the drawing/render (no file storage in v1)
  note          text,
  uploaded_by   uuid,
  created_at    timestamptz not null default now()
);

-- ── Pin comments (x/y as % of the asset) ─────────────────────────────────────
create table if not exists public.asset_comments (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.orgs(id) on delete cascade,
  asset_id  uuid not null,
  x_pct     numeric(5,2),                              -- 0–100, optional pin position
  y_pct     numeric(5,2),
  body      text not null,
  author    uuid,
  created_at timestamptz not null default now()
);

-- ── Digital sign-off gate (append-only history; latest row wins) ─────────────
create table if not exists public.asset_signoffs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  asset_id   uuid not null,
  status     text not null default 'pending',          -- pending|approved|rejected
  note       text,
  signed_by  uuid,
  signed_at  timestamptz,
  created_at timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_assets_org_created
  on public.assets(org_id, created_at desc);
create index if not exists idx_asset_comments_org_asset
  on public.asset_comments(org_id, asset_id);
create index if not exists idx_asset_signoffs_org_asset
  on public.asset_signoffs(org_id, asset_id);
