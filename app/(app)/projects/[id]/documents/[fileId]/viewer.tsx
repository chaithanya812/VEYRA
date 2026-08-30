"use client";

import { useMemo, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  History,
  MapPin,
  MessageSquare,
  ScrollText,
} from "lucide-react";
import { Card, StatusChip } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/patterns";
import { EntityCommentThread } from "@/components/ui/comment-thread";
import {
  buildThreads,
  clampPin,
  pinsFor,
  type CommentAudience,
  type CommentStatus,
} from "@/lib/comments-model";
import {
  CLIENT_APPROVAL_LABELS,
  CLIENT_APPROVAL_TONE,
  INTERNAL_STATUS_LABELS,
  INTERNAL_STATUS_TONE,
  clientApprovalOf,
  formatBytes,
  internalStatusOf,
  versionLabel,
  viewerMode,
} from "@/lib/project-files-model";
import type { ProjectFileDetail } from "@/lib/data/project-files";
import { addFileCommentAction, setCommentStatusAction } from "../actions";
import { cn, fmtDate } from "@/lib/utils";

/**
 * File viewer + review (PLAN-V4 §9.1, frame `104841`).
 *
 * Four things carry the frame's design, and each is here for a reason:
 *
 * 1. **INTERNAL and CLIENT are two threads, not one list with a flag.** A
 *    client must never see the internal one; the switch changes which
 *    conversation exists, not which rows are dimmed.
 * 2. **Comments are scoped to a version.** "Change the sofa" refers to the
 *    drawing it was written against, so `Ver n` filters the thread and
 *    switching versions switches what is rendered too.
 * 3. **Pins are numbered and the number is the join** between the marker on the
 *    drawing and the card in the rail. Numbering happens before filtering, so
 *    hiding "Accepted" never renumbers what is still on the plan.
 * 4. **Two statuses, two lifecycles** — what we think of the file, and what the
 *    client thinks. They move separately.
 *
 * ⚠ WHERE PINS CAN AND CANNOT BE PLACED, HONESTLY. A raster version renders in
 * our own element, so a click gives real coordinates and the pin lands exactly
 * where it was put. A PDF renders inside the browser's own viewer in an iframe;
 * we cannot know which page is on screen or where the click landed, so we do
 * NOT draw pins over it — a marker at a plausible-looking wrong spot is worse
 * than none. On a PDF the reviewer records the page number instead, which is
 * the same `page` column the schema already models. Rendering PDF pages
 * ourselves would mean a new dependency; PLAN-V4 says ask first.
 */
export function FileViewer({
  projectId,
  detail,
}: {
  projectId: string;
  detail: ProjectFileDetail;
}) {
  const { file, versions, urls, comments } = detail;

  const [mode, setMode] = useState<"view" | "review">("review");
  const [rail, setRail] = useState<"comments" | "versions" | "audits">("comments");
  const [audience, setAudience] = useState<CommentAudience>("internal");
  const [status, setStatus] = useState<CommentStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [showPins, setShowPins] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const latest = versions[0] ?? null;
  // `null` = every version: the thread widens, the newest drawing stays on
  // screen because there is nothing else it could sensibly show.
  const [scopeVersionId, setScopeVersionId] = useState<string | null>(
    latest?.id ?? null,
  );
  const shown = versions.find((v) => v.id === scopeVersionId) ?? latest;
  const url = shown ? urls[shown.id] : undefined;
  const render = viewerMode(shown?.mime_type ?? null);
  const canPin = render === "image";

  // Built ONCE, here. The rail renders this list and the pins are derived from
  // the same one, so a badge on the drawing is always the number beside the
  // comment (see the note in comment-thread.tsx).
  const threads = useMemo(
    () =>
      buildThreads(comments, {
        audience,
        status: status === "all" ? null : status,
        versionId: scopeVersionId,
        query,
      }),
    [comments, audience, status, scopeVersionId, query],
  );
  const pins = useMemo(() => pinsFor(threads, canPin ? page : null), [threads, canPin, page]);

  const internal = internalStatusOf(file);
  const client = clientApprovalOf(file);
  const pinnedCount = comments.filter((c) => c.x != null && c.y != null).length;

  function run(action: (fd: FormData) => Promise<{ error?: string } | undefined>, fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await action(fd);
      if (r?.error) setError(r.error);
    });
  }

  function post(body: string, who: CommentAudience, parentId?: string) {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("file_id", file.id);
    fd.set("body", body);
    fd.set("audience", who);
    if (scopeVersionId) fd.set("version_id", scopeVersionId);
    if (parentId) fd.set("parent_id", parentId);
    // A reply inherits its parent's place on the drawing; only a new comment
    // carries the pin the reviewer just placed.
    if (!parentId && pending) {
      fd.set("page", String(page));
      fd.set("x", String(pending.x));
      fd.set("y", String(pending.y));
    } else if (!parentId && !canPin && page > 1) {
      // On a PDF there is no coordinate, but the page is still real.
      fd.set("page", String(page));
    }
    run((f) => addFileCommentAction(undefined, f), fd);
    setPending(null);
  }

  function setCommentStatus(id: string, next: CommentStatus) {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("file_id", file.id);
    fd.set("comment_id", id);
    fd.set("status", next);
    run((f) => setCommentStatusAction(undefined, f), fd);
  }

  /** A click on the drawing in Review mode places the next comment's pin. */
  function placePin(e: MouseEvent<HTMLDivElement>) {
    if (mode !== "review" || !canPin) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    setPending(
      clampPin((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height),
    );
  }

  return (
    <>
      {/* ── Title bar: what this is, and which way you are working ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FileText className="size-5 shrink-0 text-[var(--color-ink-secondary)]" />
          <h1 className="truncate text-lg font-semibold text-[var(--color-ink)]">
            {file.name}
          </h1>
          <StatusChip
            tone={INTERNAL_STATUS_TONE[internal]}
            label={INTERNAL_STATUS_LABELS[internal]}
          />
          <StatusChip
            tone={CLIENT_APPROVAL_TONE[client]}
            label={CLIENT_APPROVAL_LABELS[client]}
          />
        </div>

        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Working mode"
            size="sm"
            value={mode}
            onChange={(v) => {
              setMode(v);
              if (v === "view") setPending(null);
            }}
            options={[
              { value: "view", label: "View" },
              { value: "review", label: "Review" },
            ]}
          />
          {url && (
            <DownloadLink href={url}>
              <Download className="size-4" /> Download
            </DownloadLink>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-3 py-2 text-[13px] text-[var(--color-red-hover)]">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* ── Left rail: the review conversation ── */}
        <div className="flex min-h-[560px] flex-col lg:h-[calc(100vh-13rem)]">
          <div className="mb-3">
            <SegmentedControl
              label="File panel"
              size="sm"
              value={rail}
              onChange={setRail}
              options={[
                {
                  value: "comments",
                  label: "Comments",
                  icon: <MessageSquare className="size-3.5" />,
                  badge: comments.length,
                },
                {
                  value: "versions",
                  label: "Versions",
                  icon: <History className="size-3.5" />,
                  badge: versions.length,
                },
                {
                  value: "audits",
                  label: "Audits",
                  icon: <ScrollText className="size-3.5" />,
                },
              ]}
            />
          </div>

          {rail === "comments" && (
            <EntityCommentThread
              threads={threads}
              audience={audience}
              onAudienceChange={setAudience}
              versions={versions.map((v) => ({ id: v.id, label: versionLabel(v) }))}
              versionId={scopeVersionId}
              onVersionChange={setScopeVersionId}
              status={status}
              onStatusChange={setStatus}
              query={query}
              onQueryChange={setQuery}
              onSubmit={(body, who) => post(body, who)}
              onReply={(parentId, body) => post(body, audience, parentId)}
              onSetStatus={setCommentStatus}
              activeId={activeId}
              onSelect={setActiveId}
              busy={busy}
              emptyHint={
                audience === "client"
                  ? "Nothing has been raised with the client on this version."
                  : "Point at the drawing in Review mode, then write what needs to change."
              }
              composerHint={composerHint({ mode, canPin, pending, page, render })}
            />
          )}

          {rail === "versions" && (
            <VersionList
              detail={detail}
              shownId={shown?.id ?? null}
              onShow={setScopeVersionId}
            />
          )}

          {rail === "audits" && <AuditList detail={detail} />}
        </div>

        {/* ── Right: the document ── */}
        <Card className="relative flex min-h-[560px] flex-col overflow-hidden lg:h-[calc(100vh-13rem)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2">
            <span className="flex items-center gap-2 text-[12px] text-[var(--color-ink-secondary)]">
              <span className="font-medium text-[var(--color-ink)]">
                {shown ? versionLabel(shown) : "No file"}
              </span>
              {shown && (
                <span className="tabular">
                  {formatBytes(shown.size_bytes)} · {fmtDate(shown.created_at)}
                </span>
              )}
            </span>

            <div className="flex items-center gap-2">
              {!canPin && shown && (
                <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-ink-secondary)]">
                  Page
                  <input
                    type="number"
                    min={1}
                    value={page}
                    onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
                    aria-label="Page this comment refers to"
                    className="h-7 w-16 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[12px] tabular text-[var(--color-ink)] outline-none"
                  />
                </label>
              )}
              {canPin && (
                <button
                  type="button"
                  onClick={() => setShowPins((s) => !s)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] px-2.5 py-1 text-[12px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
                >
                  {showPins ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  {showPins ? "Hide comments" : "Show comments"}
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[var(--color-surface-sunken)] p-4">
            {!shown || !url ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <FileText className="size-6 text-[var(--color-ink-disabled)]" />
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  Nothing to show yet
                </p>
                <p className="max-w-sm text-xs text-[var(--color-ink-secondary)]">
                  This file has no stored version. Add one from the documents
                  list and it will render here.
                </p>
              </div>
            ) : render === "image" ? (
              <div
                onClick={placePin}
                className={cn(
                  "relative mx-auto w-fit select-none",
                  mode === "review" && "cursor-crosshair",
                )}
              >
                {/* A plain <img>: the source is a short-lived signed URL on the
                    storage host, which next/image would need allowlisted. */}
                <img
                  src={url}
                  alt={file.name}
                  className="block max-w-full rounded-md border border-[var(--color-border)] bg-white"
                />

                {showPins &&
                  pins.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveId(p.id);
                      }}
                      title={`Comment ${p.number}`}
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                      className={cn(
                        "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white px-2 py-0.5 text-[11px] font-semibold tabular text-white shadow-md transition-transform",
                        activeId === p.id && "scale-125",
                        p.status === "accepted"
                          ? "bg-[var(--color-green)]"
                          : p.status === "not_required"
                            ? "bg-[var(--color-ink-secondary)]"
                            : "bg-[var(--color-amber)]",
                      )}
                    >
                      {p.number}
                    </button>
                  ))}

                {pending && (
                  <span
                    style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                  >
                    <MapPin className="size-6 text-[var(--color-red)] drop-shadow" />
                  </span>
                )}
              </div>
            ) : render === "pdf" ? (
              <iframe
                src={url}
                title={file.name}
                className="h-full min-h-[520px] w-full rounded-md border border-[var(--color-border)] bg-white"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <FileText className="size-6 text-[var(--color-ink-disabled)]" />
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  This type does not render in the browser
                </p>
                <p className="max-w-sm text-xs text-[var(--color-ink-secondary)]">
                  {shown.mime_type ?? "Unknown type"} · {formatBytes(shown.size_bytes)}.
                  Download it to open in the right application — comments below
                  still apply to this version.
                </p>
                <DownloadLink href={url}>
                  <Download className="size-4" /> Download {versionLabel(shown)}
                </DownloadLink>
              </div>
            )}
          </div>

          {canPin && (
            <div className="border-t border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-ink-secondary)]">
              <span className="tabular">{pins.length}</span> of{" "}
              <span className="tabular">{pinnedCount}</span> pins shown ·{" "}
              {mode === "review"
                ? "click the drawing to place the next one"
                : "switch to Review to place a pin"}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

/**
 * A signed storage URL styled as a secondary button. It has to be a real anchor
 * — the URL expires in ten minutes and is fetched by the browser directly, not
 * proxied through us.
 */
function DownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download
      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-sunken)]"
    >
      {children}
    </a>
  );
}

/** What the composer should tell the reviewer about where this comment lands. */
function composerHint(s: {
  mode: "view" | "review";
  canPin: boolean;
  pending: { x: number; y: number } | null;
  page: number;
  render: "image" | "pdf" | "download";
}): string {
  if (!s.canPin) {
    return s.render === "pdf"
      ? `Pins need an image version — this comment will be filed against page ${s.page}.`
      : "This comment applies to the version as a whole.";
  }
  if (s.pending) return "Pinned where you clicked. Write the comment to place it.";
  if (s.mode === "review") return "Click the drawing to pin this comment to a spot.";
  return "Switch to Review to pin a comment to the drawing.";
}

/* ── Versions ─────────────────────────────────────────────────────────────── */

function VersionList({
  detail,
  shownId,
  onShow,
}: {
  detail: ProjectFileDetail;
  shownId: string | null;
  onShow: (id: string) => void;
}) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <p className="text-[12px] text-[var(--color-ink-secondary)]">
          Every version is kept. What the client approved in March is still here
          in June.
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {detail.versions.map((v) => (
          <li key={v.id} className="border-b border-[var(--color-border)] last:border-0">
            <button
              type="button"
              onClick={() => onShow(v.id)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-sunken)]",
                shownId === v.id && "bg-[var(--color-surface-sunken)]",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[var(--color-ink)]">
                  {versionLabel(v)}
                </span>
                <span className="shrink-0 text-[11px] tabular text-[var(--color-ink-secondary)]">
                  {formatBytes(v.size_bytes)}
                </span>
              </span>
              {v.note && (
                <span className="text-[12px] text-[var(--color-ink)]">{v.note}</span>
              )}
              <span className="text-[11px] tabular text-[var(--color-ink-secondary)]">
                {detail.uploaderNames[v.id] ?? "Someone"} · {fmtDate(v.created_at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Audits ───────────────────────────────────────────────────────────────── */

/**
 * The frame's third tab. What is shown here is **derived from rows that exist**
 * — the file's creation and each version upload, with who and when. It is not
 * yet a full audit log: status changes are not recorded anywhere, because
 * `audit_events` is migration 0035 (PLAN-V4 §11.4). Saying so beats an empty
 * tab that implies a history nobody is keeping.
 */
function AuditList({ detail }: { detail: ProjectFileDetail }) {
  const events = [
    ...detail.versions.map((v) => ({
      at: v.created_at,
      who: detail.uploaderNames[v.id] ?? "Someone",
      what: `Uploaded ${versionLabel(v)}${v.note ? ` — ${v.note}` : ""}`,
    })),
    {
      at: detail.file.created_at,
      who: "—",
      what: `File added to ${detail.folder?.name ?? "the project root"}`,
    },
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ul className="min-h-0 flex-1 overflow-y-auto p-3">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3 border-b border-[var(--color-border)] py-2.5 last:border-0">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-ink-disabled)]" />
            <span>
              <span className="block text-[13px] text-[var(--color-ink)]">{e.what}</span>
              <span className="block text-[11px] tabular text-[var(--color-ink-secondary)]">
                {e.who} · {fmtDate(e.at)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-ink-secondary)]">
        Uploads and versions, from the rows we keep. Status changes join this
        list when the audit ledger lands.
      </p>
    </Card>
  );
}
