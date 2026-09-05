"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  MessageSquare,
  PenLine,
  Plus,
  Ruler,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, EmptyState, StatusChip } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, SubmitButton } from "../../../dashboard/workspace-ui";
import {
  CLIENT_APPROVALS,
  CLIENT_APPROVAL_LABELS,
  CLIENT_APPROVAL_TONE,
  INTERNAL_STATUSES,
  INTERNAL_STATUS_LABELS,
  INTERNAL_STATUS_TONE,
  clientApprovalOf,
  fileKind,
  formatBytes,
  groupFilesByFolder,
  internalStatusOf,
} from "@/lib/project-files-model";
import type { FileWithMeta, ProjectFileBrowser } from "@/lib/data/project-files";
import {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  updateFileAction,
  uploadFileAction,
  type DocState,
} from "./actions";
import { fmtDate } from "@/lib/utils";

/**
 * Designs & Documents (PLAN-V4 §9.1, frames `104742` / `104841`).
 *
 * **Folders belong to this project and nothing else.** Every folder shown, and
 * every folder offered in a picker, comes from this project's own list — so
 * "2D" here and "2D" on another project are two different folders that can
 * never see each other's files. The owner asked for exactly that.
 *
 * A file carries two independent statuses, which is the structural point of
 * the frame: what we think of it (Draft / Approved) and what the client thinks
 * (Not shared / No action / Revision requested / Approved). They move
 * separately because they mean different things.
 */
const initial: DocState = undefined;

export function DocumentsView({
  projectId,
  data,
}: {
  projectId: string;
  data: ProjectFileBrowser;
}) {
  const groups = useMemo(
    () => groupFilesByFolder(data.files, data.folders),
    [data.files, data.folders],
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-secondary)]">
          <span className="font-medium text-[var(--color-ink)] tabular">
            {data.files.length}
          </span>{" "}
          {data.files.length === 1 ? "file" : "files"} in{" "}
          <span className="font-medium text-[var(--color-ink)] tabular">
            {data.folders.length}
          </span>{" "}
          {data.folders.length === 1 ? "folder" : "folders"} ·{" "}
          <span className="tabular">{formatBytes(data.storageBytes)}</span> stored
        </p>
        <div className="flex items-center gap-2">
          <NewFolderDialog projectId={projectId} />
          <UploadDialog projectId={projectId} data={data} />
        </div>
      </div>

      {/* Folders — this project's own, listed even when empty so people can
          file into them. */}
      {data.folders.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.folders.map((f) => {
            const count = data.files.filter((x) => x.folder_id === f.id).length;
            return (
              <span
                key={f.id}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-3 pr-1.5 text-[13px]"
              >
                <span className="text-[var(--color-ink)]">{f.name}</span>
                <span className="tabular text-[var(--color-ink-secondary)]">{count}</span>
                <form action={deleteFolderAction} className="inline-flex">
                  <input type="hidden" name="project_id" value={projectId} />
                  <input type="hidden" name="id" value={f.id} />
                  <button
                    type="submit"
                    title={`Delete ${f.name} — its files stay in the project`}
                    className="rounded-full p-1 text-[var(--color-ink-disabled)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-red)]"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </form>
              </span>
            );
          })}
        </div>
      )}

      {data.files.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="size-8" />}
          title="No files yet"
          description="Upload a drawing, a quotation or a photo. Files live under this project only — another project cannot see them."
          action={<UploadDialog projectId={projectId} data={data} />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <Card key={g.folder?.id ?? "unfiled"} className="overflow-hidden">
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-2.5">
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  {g.folder?.name ?? "Unfiled"}
                  <span className="ml-2 text-[12px] font-normal text-[var(--color-ink-secondary)] tabular">
                    {g.files.length}
                  </span>
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Comments</th>
                      <th className="px-4 py-2 font-medium">Version</th>
                      <th className="px-4 py-2 font-medium">Internal</th>
                      <th className="px-4 py-2 font-medium">Client approval</th>
                      <th className="px-4 py-2 font-medium">Uploaded</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {g.files.map((f) => (
                      <FileRow
                        key={f.id}
                        projectId={projectId}
                        file={f}
                        data={data}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/* ── One row ──────────────────────────────────────────────────────────────── */

function KindIcon({ mime }: { mime: string | null }) {
  const kind = fileKind(mime);
  const cls = "size-4 shrink-0 text-[var(--color-ink-secondary)]";
  if (kind === "image") return <ImageIcon className={cls} />;
  if (kind === "sheet") return <FileSpreadsheet className={cls} />;
  if (kind === "cad") return <Ruler className={cls} />;
  if (kind === "archive") return <FileArchive className={cls} />;
  return <FileText className={cls} />;
}

function FileRow({
  projectId,
  file,
  data,
}: {
  projectId: string;
  file: FileWithMeta;
  data: ProjectFileBrowser;
}) {
  const [state, update] = useActionState(updateFileAction, initial);
  const internal = internalStatusOf(file);
  const client = clientApprovalOf(file);

  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 align-top">
      <td className="px-4 py-3">
        <span className="flex items-center gap-2">
          <KindIcon mime={file.latest?.mime_type ?? null} />
          <span className="min-w-0">
            <Link
              href={`/projects/${projectId}/documents/${file.id}`}
              className="block truncate font-medium text-[var(--color-ink)] hover:underline"
            >
              {file.name}
            </Link>
            <span className="block text-[11px] tabular text-[var(--color-ink-secondary)]">
              {formatBytes(file.latest?.size_bytes)}
              {file.description ? ` · ${file.description}` : ""}
            </span>
          </span>
        </span>
        {state?.error && (
          <span className="mt-1 block text-[11px] text-[var(--color-red)]">
            {state.error}
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        <CommentsLink projectId={projectId} file={file} />
      </td>

      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular text-[var(--color-ink)]">v{file.current_version}</span>
          <NewVersionDialog projectId={projectId} file={file} />
        </span>
      </td>

      <td className="px-4 py-3">
        <form action={update}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="id" value={file.id} />
          <Select
            name="internal_status"
            key={file.internal_status}
            defaultValue={internal}
            aria-label={`Internal status for ${file.name}`}
            className="h-7 w-28 text-[12px]"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {INTERNAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INTERNAL_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </form>
        <span className="mt-1 inline-block">
          <StatusChip
            tone={INTERNAL_STATUS_TONE[internal]}
            label={INTERNAL_STATUS_LABELS[internal]}
          />
        </span>
      </td>

      <td className="px-4 py-3">
        <form action={update}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="id" value={file.id} />
          <Select
            name="client_approval"
            key={file.client_approval}
            defaultValue={client}
            aria-label={`Client approval for ${file.name}`}
            className="h-7 w-44 text-[12px]"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {CLIENT_APPROVALS.map((s) => (
              <option key={s} value={s}>
                {CLIENT_APPROVAL_LABELS[s]}
              </option>
            ))}
          </Select>
        </form>
        <span className="mt-1 inline-block">
          <StatusChip
            tone={CLIENT_APPROVAL_TONE[client]}
            label={CLIENT_APPROVAL_LABELS[client]}
          />
        </span>
      </td>

      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        <span className="block">{file.uploadedByName ?? "—"}</span>
        <span className="block text-[11px] tabular">{fmtDate(file.created_at)}</span>
      </td>

      <td className="px-4 py-3">
        <span className="flex items-center gap-1">
          <MoveDialog projectId={projectId} file={file} data={data} />
          <form action={deleteFileAction}>
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="id" value={file.id} />
            <Button type="submit" variant="ghost" size="sm" title="Delete file">
              <Trash2 className="size-3.5" />
            </Button>
          </form>
        </span>
      </td>
    </tr>
  );
}

/* ── Dialogs ──────────────────────────────────────────────────────────────── */

function NewFolderDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, create] = useActionState(createFolderAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <FolderPlus className="size-4" /> New folder
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            Folders belong to this project. Another project can have a folder
            with the same name — they stay entirely separate.
          </DialogDescription>
        </DialogHeader>
        <form action={create} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <FormError error={state?.error} />
          <Field label="Name" htmlFor="folder_name" required>
            <Input id="folder_name" name="name" placeholder="2D drawings" required />
          </Field>
          <div>
            <SubmitButton pendingLabel="Creating…">Create folder</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  projectId,
  data,
}: {
  projectId: string;
  data: ProjectFileBrowser;
}) {
  const [open, setOpen] = useState(false);
  const [state, upload] = useActionState(uploadFileAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus className="size-4" /> Add file
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a file</DialogTitle>
          <DialogDescription>
            Drawings, PDFs, sheets and CAD files, up to 25 MB. Stored privately —
            links are signed and expire.
          </DialogDescription>
        </DialogHeader>
        <form action={upload} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <FormError error={state?.error} />

          <Field label="File" htmlFor="up_file" required>
            <input
              id="up_file"
              name="file"
              type="file"
              required
              className="block w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-surface-sunken)] file:px-3 file:py-1.5 file:text-[13px] file:text-[var(--color-ink)]"
            />
          </Field>

          <Field label="Name" htmlFor="up_name" hint="Defaults to the file's own name.">
            <Input id="up_name" name="name" placeholder="Ground floor — 2D plan" />
          </Field>

          <Field label="Folder" htmlFor="up_folder">
            {/* This project's folders only — the picker cannot offer another
                project's folder, and the server re-checks anyway. */}
            <Select id="up_folder" name="folder_id" defaultValue="">
              <option value="">No folder</option>
              {data.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Description" htmlFor="up_desc">
            <Textarea id="up_desc" name="description" rows={2} placeholder="What is it?" />
          </Field>

          <div>
            <SubmitButton pendingLabel="Uploading…">
              <Upload className="size-4" /> Upload
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewVersionDialog({
  projectId,
  file,
}: {
  projectId: string;
  file: FileWithMeta;
}) {
  const [open, setOpen] = useState(false);
  const [state, upload] = useActionState(uploadFileAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Add a version"
          className="rounded-full p-0.5 text-[var(--color-ink-disabled)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
        >
          <Plus className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New version of {file.name}</DialogTitle>
          <DialogDescription>
            Version {file.current_version + 1}. Earlier versions are kept, never
            overwritten — what the client approved in March stays answerable.
          </DialogDescription>
        </DialogHeader>
        <form action={upload} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="file_id" value={file.id} />
          <input type="hidden" name="name" value={file.name} />
          <FormError error={state?.error} />

          <Field label="File" htmlFor={`ver_${file.id}`} required>
            <input
              id={`ver_${file.id}`}
              name="file"
              type="file"
              required
              className="block w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="What changed" htmlFor={`note_${file.id}`}>
            <Input id={`note_${file.id}`} name="note" placeholder="Moved the TV unit" />
          </Field>

          <div>
            <SubmitButton pendingLabel="Uploading…">Add version</SubmitButton>
          </div>
        </form>

        {file.versions.length > 0 && (
          <div className="border-t border-[var(--color-border)] pt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
              History
            </p>
            <ul className="flex flex-col gap-1 text-[12px]">
              {file.versions.map((v) => (
                <li key={v.id} className="flex justify-between gap-3">
                  <span className="text-[var(--color-ink)]">
                    v{v.version_no}
                    {v.note ? ` — ${v.note}` : ""}
                  </span>
                  <span className="shrink-0 tabular text-[var(--color-ink-secondary)]">
                    {formatBytes(v.size_bytes)} · {fmtDate(v.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  projectId,
  file,
  data,
}: {
  projectId: string;
  file: FileWithMeta;
  data: ProjectFileBrowser;
}) {
  const [open, setOpen] = useState(false);
  const [state, update] = useActionState(updateFileAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Rename or move">
          <PenLine className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
          <DialogDescription>
            Only this project&apos;s folders are offered — a file cannot move
            into another project.
          </DialogDescription>
        </DialogHeader>
        <form action={update} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="id" value={file.id} />
          <FormError error={state?.error} />

          <Field label="Name" htmlFor={`mv_name_${file.id}`}>
            <Input id={`mv_name_${file.id}`} name="name" defaultValue={file.name} />
          </Field>
          <Field label="Folder" htmlFor={`mv_folder_${file.id}`}>
            <Select
              id={`mv_folder_${file.id}`}
              name="folder_id"
              defaultValue={file.folder_id ?? ""}
            >
              <option value="">No folder</option>
              {data.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor={`mv_desc_${file.id}`}>
            <Textarea
              id={`mv_desc_${file.id}`}
              name="description"
              rows={2}
              defaultValue={file.description ?? ""}
            />
          </Field>

          <div>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The way into the viewer (`104841`), carrying what the list needs to show:
 * how much conversation a file has, and how much of it is still unanswered.
 * The pending count is the useful half — twelve settled comments need nobody's
 * attention, one open one does.
 */
function CommentsLink({
  projectId,
  file,
}: {
  projectId: string;
  file: FileWithMeta;
}) {
  return (
    <Link
      href={`/projects/${projectId}/documents/${file.id}`}
      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[12px] text-[var(--color-ink-secondary)] transition-colors hover:text-[var(--color-ink)]"
    >
      <MessageSquare className="size-3" />
      <span className="tabular">{file.commentCount}</span>
      {file.pendingCount > 0 && (
        <span className="tabular text-[var(--color-amber)]">
          · {file.pendingCount} pending
        </span>
      )}
    </Link>
  );
}
