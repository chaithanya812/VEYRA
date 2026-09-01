"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Camera,
  Expand,
  ImageOff,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ClientVisibleToggle, SegmentedControl } from "@/components/ui/patterns";
import { EntityCommentThread } from "@/components/ui/comment-thread";
import { FormError, SubmitButton } from "../../../dashboard/workspace-ui";
import {
  buildThreads,
  type CommentAudience,
  type CommentStatus,
  type EntityComment,
} from "@/lib/comments-model";
import {
  SITE_PHOTO_TABS,
  SITE_PHOTO_TAB_LABELS,
  filterPhotos,
  formatPhotoDate,
  groupPhotosByDate,
  selectionSummary,
  tabCounts,
  wasUploadedLater,
  type SitePhotoTab,
} from "@/lib/site-photos-model";
import type { SitePhotoWithMeta, SiteProgressBoard } from "@/lib/data/site-photos";
import {
  addPhotoCommentAction,
  addProgressAction,
  deletePhotoAction,
  deletePhotosAction,
  setPhotoCommentStatusAction,
  setVisibilityAction,
  updatePhotoAction,
  type SiteState,
} from "./actions";
import { cn, fmtDate } from "@/lib/utils";

/**
 * Site Progress Uploads (PLAN-V4 §9.5, frame `105527`).
 *
 * A dated photo record for one project, with three things the frame gets right
 * and this screen keeps:
 *
 * 1. **The three tabs are a real filter on a stored flag**, not a view
 *    preference. `Client Visible` / `Client Not Visible` decide what the
 *    Progress Report carries, and that report is the only thing that reaches
 *    the client (§0). So the tabs carry counts: a project with forty photos and
 *    none marked visible should say so out loud.
 * 2. **Per-photo conversation.** `Client Chat` is the same thread component as
 *    a drawing's comments and an order's activity — one model, three surfaces.
 * 3. **Grouped by date**, because a photo's value is entirely in when it was
 *    taken. We group by the day the work happened rather than the day the file
 *    arrived, and say so on the card when the two differ.
 *
 * Red appears once: `Add progress`. Delete is a ghost control that turns red on
 * hover (DESIGN-DIRECTION §2, jobs 1 and 3) and nothing else on the screen
 * competes for it.
 */

export function SiteProgressView({
  projectId,
  board,
  initialTab,
}: {
  projectId: string;
  board: SiteProgressBoard;
  initialTab: SitePhotoTab;
}) {
  const [tab, setTab] = useState<SitePhotoTab>(initialTab);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const counts = useMemo(() => tabCounts(board.photos), [board.photos]);
  const shown = useMemo(() => filterPhotos(board.photos, tab), [board.photos, tab]);
  const groups = useMemo(() => groupPhotosByDate(shown), [shown]);
  const picked = useMemo(
    () => selectionSummary(board.photos, selected),
    [board.photos, selected],
  );

  function run(
    action: (prev: SiteState, fd: FormData) => Promise<SiteState>,
    fd: FormData,
  ) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const r = await action(undefined, fd);
      if (r?.error) setError(r.error);
      if (r?.note) setNote(r.note);
    });
  }

  function bulk(kind: "show" | "hide" | "delete") {
    const fd = new FormData();
    fd.set("project_id", projectId);
    for (const id of selected) fd.append("ids", id);
    if (kind === "delete") {
      run(deletePhotosAction, fd);
    } else {
      fd.set("visible", kind === "show" ? "true" : "false");
      run(setVisibilityAction, fd);
    }
    setSelected([]);
  }

  function toggleOne(id: string, next: boolean) {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.append("ids", id);
    fd.set("visible", next ? "true" : "false");
    run(setVisibilityAction, fd);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Which photos"
          value={tab}
          onChange={setTab}
          options={SITE_PHOTO_TABS.map((t) => ({
            value: t,
            label: SITE_PHOTO_TAB_LABELS[t],
            badge: counts[t],
          }))}
        />

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSelecting((s) => !s);
              setSelected([]);
            }}
            aria-pressed={selecting}
          >
            {selecting ? "Done selecting" : "Select"}
          </Button>
          <AddProgressDialog projectId={projectId} />
        </div>
      </div>

      {/* The bulk bar, which exists only while something is selected. A menu
          that is always there invites a click on an empty selection; this
          cannot be pressed until it would do something, and it always says how
          much it is about to do. */}
      {selecting && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
          <p className="text-[13px] text-[var(--color-ink-secondary)]">
            <span className="font-medium tabular text-[var(--color-ink)]">
              {picked.count}
            </span>{" "}
            selected
            {picked.count > 0 && (
              <span className="tabular">
                {" "}
                · {picked.visible} visible to the client, {picked.hidden} not
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || picked.count === 0}
              onClick={() => bulk("show")}
            >
              Share with client
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || picked.count === 0}
              onClick={() => bulk("hide")}
            >
              Hide from client
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || picked.count === 0}
              onClick={() => bulk("delete")}
              className="text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]"
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <p className="mb-3 rounded-md border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-3 py-2 text-[13px] text-[var(--color-red)]">
          {error}
        </p>
      )}
      {note && !error && (
        <p className="mb-3 rounded-md bg-[var(--color-surface-sunken)] px-3 py-2 text-[13px] text-[var(--color-ink-secondary)]">
          {note}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<Camera className="size-8" />}
          title={
            board.photos.length === 0
              ? "No site photos yet"
              : tab === "client_visible"
                ? "Nothing is shared with the client"
                : "Every photo is shared with the client"
          }
          description={
            board.photos.length === 0
              ? "Add progress photos from a site visit. They stay under this project, and nothing reaches the client until it is marked visible."
              : tab === "client_visible"
                ? `All ${counts.all} photos on record are internal. Mark the ones the client should see.`
                : `All ${counts.all} photos on record are shared with the client.`
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.day || "undated"}>
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  {g.label}
                </h2>
                <span className="text-[12px] tabular text-[var(--color-ink-secondary)]">
                  {g.photos.length} {g.photos.length === 1 ? "photo" : "photos"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {g.photos.map((p) => (
                  <PhotoCard
                    key={p.id}
                    projectId={projectId}
                    photo={p}
                    comments={board.comments[p.id] ?? []}
                    selecting={selecting}
                    checked={selected.includes(p.id)}
                    onCheck={(on) =>
                      setSelected((cur) =>
                        on ? [...cur, p.id] : cur.filter((x) => x !== p.id),
                      )
                    }
                    onVisibility={(next) => toggleOne(p.id, next)}
                    busy={busy}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* ── One card ─────────────────────────────────────────────────────────────── */

function PhotoCard({
  projectId,
  photo,
  comments,
  selecting,
  checked,
  onCheck,
  onVisibility,
  busy,
}: {
  projectId: string;
  photo: SitePhotoWithMeta;
  comments: EntityComment[];
  selecting: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
  onVisibility: (next: boolean) => void;
  busy: boolean;
}) {
  return (
    <Card
      className={cn(
        "group relative flex flex-col overflow-hidden",
        checked && "ring-2 ring-[var(--color-ink)]",
      )}
    >
      <div className="relative">
        <PhotoImage photo={photo} className="aspect-[4/3] w-full object-cover" />

        {selecting && (
          <label className="absolute left-2 top-2 flex size-6 cursor-pointer items-center justify-center rounded-md bg-[var(--color-surface)]/90 shadow-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onCheck(e.target.checked)}
              aria-label={`Select ${photo.caption ?? "photo"}`}
              className="size-3.5 accent-[var(--color-ink)]"
            />
          </label>
        )}

        {/* Hover controls, exactly the three the frame has. They are also
            keyboard-reachable: focus-within keeps them on screen, so this is
            not a mouse-only card. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="pointer-events-auto flex justify-end gap-1">
            <ExpandDialog projectId={projectId} photo={photo} />
            <form action={deletePhotoAction}>
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="id" value={photo.id} />
              <button
                type="submit"
                title="Delete this photo"
                className="rounded-full bg-[var(--color-surface)]/90 p-1.5 text-[var(--color-ink-secondary)] shadow-sm transition-colors hover:text-[var(--color-red)]"
              >
                <Trash2 className="size-3.5" />
              </button>
            </form>
          </div>
          <div className="pointer-events-auto flex justify-end">
            <ChatDialog projectId={projectId} photo={photo} comments={comments} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
        <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">
          {photo.caption ?? "Untitled"}
        </p>
        <p className="text-[11px] text-[var(--color-ink-secondary)]">
          Uploaded by {photo.uploadedByName ?? "someone"}
          {wasUploadedLater(photo) && (
            <span className="tabular"> · uploaded {fmtDate(photo.created_at)}</span>
          )}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <ClientVisibleToggle
            key={String(photo.client_visible)}
            checked={photo.client_visible}
            disabled={busy}
            onChange={onVisibility}
          />
          {photo.clientCommentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-secondary)]">
              <MessageSquare className="size-3" />
              <span className="tabular">{photo.clientCommentCount}</span>
              {photo.clientPendingCount > 0 && (
                <span className="tabular text-[var(--color-amber)]">
                  · {photo.clientPendingCount} open
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * The bytes are private: this `src` is a signed URL minted on the server for
 * this request and it expires. A row whose object has gone missing renders as a
 * labelled placeholder rather than a broken image icon.
 */
function PhotoImage({
  photo,
  className,
}: {
  photo: SitePhotoWithMeta;
  className?: string;
}) {
  if (!photo.signedUrl) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 bg-[var(--color-surface-sunken)] text-[var(--color-ink-disabled)]",
          className,
        )}
      >
        <ImageOff className="size-5" />
        <span className="text-[11px]">Image unavailable</span>
      </div>
    );
  }
  return (
    // A signed, short-lived URL on a private bucket — not a domain next/image
    // could be configured for, and not one worth caching at the edge.
    <img
      src={photo.signedUrl}
      alt={photo.caption ?? "Site progress photo"}
      className={cn("bg-[var(--color-surface-sunken)]", className)}
    />
  );
}

/* ── Expand: the full photo, and the two facts about it worth correcting ──── */

function ExpandDialog({
  projectId,
  photo,
}: {
  projectId: string;
  photo: SitePhotoWithMeta;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function save(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await updatePhotoAction(undefined, fd);
      if (r?.error) setError(r.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Open this photo"
          className="rounded-full bg-[var(--color-surface)]/90 p-1.5 text-[var(--color-ink-secondary)] shadow-sm transition-colors hover:text-[var(--color-ink)]"
        >
          <Expand className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{photo.caption ?? "Site photo"}</DialogTitle>
          <DialogDescription>
            {formatPhotoDate((photo.taken_on ?? photo.created_at ?? "").slice(0, 10))}
            {" · uploaded by "}
            {photo.uploadedByName ?? "someone"} on {fmtDate(photo.created_at)}
          </DialogDescription>
        </DialogHeader>

        <PhotoImage
          photo={photo}
          className="max-h-[55vh] w-full rounded-[var(--radius-card)] object-contain"
        />

        <form action={save} className="flex flex-col gap-3">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="id" value={photo.id} />
          <FormError error={error ?? undefined} />

          <Field label="Caption" htmlFor={`cap_${photo.id}`}>
            <Input
              id={`cap_${photo.id}`}
              name="caption"
              defaultValue={photo.caption ?? ""}
              placeholder="What does this show?"
            />
          </Field>
          <Field
            label="Date on site"
            htmlFor={`day_${photo.id}`}
            hint="The day the work was photographed — not the day the file was uploaded."
          >
            <Input
              id={`day_${photo.id}`}
              name="taken_on"
              type="date"
              defaultValue={(photo.taken_on ?? photo.created_at ?? "").slice(0, 10)}
            />
          </Field>

          <div>
            <SubmitButton pendingLabel="Saving…" disabled={busy}>
              Save
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Client Chat: the shared thread, third surface ────────────────────────── */

function ChatDialog({
  projectId,
  photo,
  comments,
}: {
  projectId: string;
  photo: SitePhotoWithMeta;
  comments: EntityComment[];
}) {
  const [open, setOpen] = useState(false);
  // Defaults to the client thread because the frame's button says `Client
  // Chat`. The switch is still there: this is a staff screen, and the internal
  // note about the same photo belongs on the same photo.
  const [audience, setAudience] = useState<CommentAudience>("client");
  const [status, setStatus] = useState<CommentStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // Built once, here, from the list the server already sent — the badge on the
  // card and the rows in this dialog can never disagree.
  const threads = useMemo(
    () =>
      buildThreads(comments, {
        audience,
        status: status === "all" ? null : status,
        query,
      }),
    [comments, audience, status, query],
  );

  function post(body: string, who: CommentAudience, parentId?: string) {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("photo_id", photo.id);
    fd.set("body", body);
    fd.set("audience", who);
    if (parentId) fd.set("parent_id", parentId);
    setError(null);
    startTransition(async () => {
      const r = await addPhotoCommentAction(undefined, fd);
      if (r?.error) setError(r.error);
    });
  }

  function setCommentStatus(id: string, next: CommentStatus) {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("comment_id", id);
    fd.set("status", next);
    setError(null);
    startTransition(async () => {
      const r = await setPhotoCommentStatusAction(undefined, fd);
      if (r?.error) setError(r.error);
    });
  }

  const open_ = photo.clientPendingCount;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)]/95 px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-ink)] shadow-sm transition-colors hover:bg-[var(--color-surface)]"
        >
          <MessageSquare className="size-3.5" /> Client chat
          {open_ > 0 && (
            <span className="tabular text-[var(--color-amber)]">{open_}</span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{photo.caption ?? "Site photo"}</DialogTitle>
          <DialogDescription>
            The client thread is what a client would be sent. The internal one
            never leaves this workspace.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-[12px] text-[var(--color-red)]">{error}</p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <PhotoImage
            photo={photo}
            className="max-h-[50vh] w-full rounded-[var(--radius-card)] object-contain"
          />
          <div className="h-[50vh] min-h-0">
            <EntityCommentThread
              threads={threads}
              audience={audience}
              onAudienceChange={setAudience}
              status={status}
              onStatusChange={setStatus}
              query={query}
              onQueryChange={setQuery}
              onSubmit={(body, who) => post(body, who)}
              onReply={(parentId, body) => post(body, audience, parentId)}
              onSetStatus={setCommentStatus}
              busy={busy}
              placeholder="Message about this photo"
              emptyHint="Ask about what the photo shows, or record what was agreed on site."
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── + Add progress ───────────────────────────────────────────────────────── */

function AddProgressDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await addProgressAction(undefined, fd);
      if (r?.error) setError(r.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus className="size-4" /> Add progress
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add site progress</DialogTitle>
          <DialogDescription>
            Photos only, up to 25 MB each. Several at once — a site visit
            produces a batch, and they share a date and a caption you can correct
            afterwards.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <FormError error={error ?? undefined} />

          <Field label="Photos" htmlFor="site_photos" required>
            <input
              id="site_photos"
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              required
              className="block w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-surface-sunken)] file:px-3 file:py-1.5 file:text-[13px] file:text-[var(--color-ink)]"
            />
          </Field>

          <Field
            label="Date on site"
            htmlFor="site_taken_on"
            hint="Defaults to today. Set it to the day the photos were taken if you are uploading later."
          >
            <Input
              id="site_taken_on"
              name="taken_on"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>

          <Field label="Caption" htmlFor="site_caption">
            <Textarea
              id="site_caption"
              name="caption"
              rows={2}
              placeholder="Ground floor — false ceiling framing"
            />
          </Field>

          <label className="flex items-start gap-2 text-[13px] text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="client_visible"
              value="true"
              className="mt-0.5 size-4 accent-[var(--color-red)]"
            />
            <span>
              Share these with the client
              <span className="block text-[11px] text-[var(--color-ink-secondary)]">
                Off by default. Only what is marked visible appears in the
                progress report.
              </span>
            </span>
          </label>

          <div>
            <SubmitButton pendingLabel="Uploading…" disabled={busy}>
              <Camera className="size-4" /> Add photos
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
