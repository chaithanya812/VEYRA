-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Site Progress Uploads: a dated, client-gated photo record
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §9.5, frame `105527`.
--
-- ⚠ THIS EXTENDS `site_photos` (0019) RATHER THAN ADDING A TABLE, and that is
--   the whole decision. A "site progress photo" and a "site photo" are the same
--   object: 0019 already stores one per project with a caption, 0028 gave it a
--   real `project_id`, and `entity_comments` (0029) already keys a thread by
--   (entity_type, entity_id) with 'site_photo' named in its header as one of
--   the three consumers. A `project_site_photos` table would have been a second
--   photo model with a second comment path and two places to ask "what has this
--   project got on record" — the same mistake 0030's header talks a later
--   session out of making with money.
--
-- WHAT IS ACTUALLY NEW here is everything the frame needs and 0019 lacks:
--
--   `storage_path`   — 0019 stored a pasted URL. A photo taken on site is a
--                      file, so it now lives in the SAME private bucket as
--                      project documents, under the same
--                      `<org_id>/<project_id>/<photo_id>/…` prefix. The URL
--                      column stays for the rows that already use it — a
--                      pasted link is still a valid way to record a photo, and
--                      dropping the column would be a destructive migration.
--
--   `client_visible` — the flag the three tabs (`All · Client Visible ·
--                      Client Not Visible`) filter on, and the one the Progress
--                      Report reads. VEYRA ships no client portal (§0), so that
--                      report IS what reaches the client and this boolean is
--                      the only thing standing between an internal snag photo
--                      and the client's inbox. Default FALSE: a photo becomes
--                      shareable because somebody said so, never by default.
--
--   `taken_on`       — the frame groups by *upload* date. That is wrong the
--                      moment somebody uploads Friday's photos on Monday, which
--                      is how site photography actually works. The date the
--                      work happened is a separate fact from the date the file
--                      arrived, so it gets its own column and the grid groups
--                      by it; `created_at` still records when it landed and the
--                      card still shows both.
--
--   `uploaded_by`    — `Uploaded by: Radhika Rana` in the card footer.
--
-- PER-PROJECT ISOLATION (the owner's standing instruction) is enforced the same
-- three ways as documents: the FK, the check constraint below, and the storage
-- prefix. A stored photo with no project would be a file nobody could scope.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.site_photos add column if not exists storage_path   text;
alter table public.site_photos add column if not exists mime_type      text;
alter table public.site_photos add column if not exists size_bytes     bigint not null default 0;
alter table public.site_photos add column if not exists client_visible boolean not null default false;
alter table public.site_photos add column if not exists taken_on       date;
alter table public.site_photos add column if not exists uploaded_by    uuid;

-- Rows that predate this migration were recorded on the day they landed, so
-- that is the honest value for them. New rows default to today and the upload
-- form lets a person correct it.
update public.site_photos
   set taken_on = created_at::date
 where taken_on is null;

alter table public.site_photos alter column taken_on set default current_date;

-- A stored object must name its project: the project id is a path segment, so
-- without it the bytes have nowhere to live and no prefix to be scoped by.
-- Pasted-URL rows (0019) are exempt — they store no object.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'site_photos_stored_needs_project'
       and conrelid = 'public.site_photos'::regclass
  ) then
    alter table public.site_photos
      add constraint site_photos_stored_needs_project
      check (storage_path is null or project_id is not null);
  end if;
end $$;

-- One object, one row. Two rows pointing at the same key would make deleting
-- either one break the other.
create unique index if not exists uq_site_photos_storage_path
  on public.site_photos(storage_path)
  where storage_path is not null;

-- The grid's read: one project, newest site date first.
create index if not exists idx_site_photos_org_project_date
  on public.site_photos(org_id, project_id, taken_on desc, created_at desc);

-- The three tabs filter on this, so it is worth an index of its own once a
-- project has a few hundred photos.
create index if not exists idx_site_photos_client_visible
  on public.site_photos(org_id, project_id, client_visible);
