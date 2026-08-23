-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Site execution (v1)  ·  Operations   ·  OPS-SITE-001
-- ════════════════════════════════════════════════════════════════════════════
-- Field execution on site: daily site logs with a photo feed, geo check-in
-- attendance, and measurement variance (measured qty vs quoted qty) — the
-- variance wedge no competitor tracks.
--
-- `project_label` is a plain free-text label (no hard FK to projects) so the
-- site surfaces stay usable before/without a Projects row, mirroring
-- warehouses.project_label.
--
-- Photos carry a pasted `url` in v1 — real file storage is NOT wired; there
-- is deliberately no bucket/upload handling here.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    All four tables are added to the tenant allowlist in lib/data/tables.ts.
--    Additive migration; idempotent (if-not-exists everywhere).
-- IMPORTANT: quoted_qty / measured_qty are CONFIG the user enters. Variance
--    is a PURE computation (lib/site-model.ts variancePct) — never an LLM
--    output (HARD RULE 4).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Daily site logs ──────────────────────────────────────────────────────────
create table if not exists public.site_logs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  project_label text,
  log_date      date not null default current_date,
  work_summary  text not null,
  author        uuid,
  created_at    timestamptz not null default now()
);

-- ── Photo feed (pasted links; optional attachment to a log) ──────────────────
create table if not exists public.site_photos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  site_log_id   uuid,
  project_label text,
  caption       text,
  url           text,
  created_at    timestamptz not null default now()
);

-- ── Geo check-in / check-out attendance ──────────────────────────────────────
create table if not exists public.site_attendance (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  project_label text,
  member_name   text not null,
  check_in      timestamptz not null default now(),
  check_out     timestamptz,
  lat           numeric(9,6),
  lng           numeric(9,6),
  created_at    timestamptz not null default now()
);

-- ── Measurement variance (measured vs quoted — the wedge metric) ─────────────
create table if not exists public.measurement_variance (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  project_label text,
  item_name     text not null,
  uom           text,
  quoted_qty    numeric(14,2) not null default 0,
  measured_qty  numeric(14,2) not null default 0,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_site_logs_org_date
  on public.site_logs(org_id, log_date desc);
create index if not exists idx_site_photos_org_log
  on public.site_photos(org_id, site_log_id);
create index if not exists idx_site_attendance_org_project
  on public.site_attendance(org_id, project_label);
create index if not exists idx_measurement_variance_org_project
  on public.measurement_variance(org_id, project_label);
