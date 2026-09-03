"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createWarehouseAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  WAREHOUSE_KINDS,
  type WarehouseKind,
} from "@/lib/inventory-model";

/**
 * `Add Warehouse` — the ONE red primary on the Warehouse/Site tab (`110109`).
 *
 * The frame puts a second red button beside it (`Material Search`, outlined
 * red), which DESIGN-DIRECTION §7 lists as a mistake not to copy: two reds per
 * view dilutes the single-primary rule. Material search is a black secondary
 * here.
 *
 * The kind switch is the whole point of the dialog. A warehouse is company or
 * project, and a project one has to name its project — the data layer checks
 * that project is in this workspace before writing anything, because an id off
 * a form is not evidence.
 */
export function AddWarehouseDialog({
  projects,
  parents,
}: {
  projects: { id: string; name: string }[];
  parents: { id: string; name: string; kind: WarehouseKind }[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const [kind, setKind] = useState<WarehouseKind>("company");
  const [projectId, setProjectId] = useState("");
  const [parentId, setParentId] = useState("");

  // A bin inherits its parent's scope, so the kind and project controls stop
  // being questions the moment a parent is chosen.
  const isBin = parentId.length > 0;
  const parent = parents.find((p) => p.id === parentId);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r: FormState = await createWarehouseAction(undefined, fd);
      if (r?.error) setError(r.error);
      else {
        setOpen(false);
        setKind("company");
        setProjectId("");
        setParentId("");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus className="size-4" /> Add warehouse
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add warehouse</DialogTitle>
          <DialogDescription>
            A company store, a project site store, or a location inside one of
            them.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="wh_name" required>
            <Input
              id="wh_name"
              name="name"
              placeholder="e.g. Main godown"
              required
            />
          </Field>

          <Field
            label="Inside"
            htmlFor="wh_parent"
            hint="Leave blank for a top-level warehouse. A location inherits its warehouse's scope."
          >
            <Select
              id="wh_parent"
              name="parent_id"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— Top level —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          {isBin ? (
            <p className="rounded-md bg-[var(--color-surface-sunken)] px-3 py-2 text-[13px] text-[var(--color-ink-secondary)]">
              This location will belong to{" "}
              <span className="font-medium text-[var(--color-ink)]">
                {parent?.name}
              </span>{" "}
              and inherit its{" "}
              {parent?.kind === "project" ? "project" : "company"} scope.
            </p>
          ) : (
            <>
              <Field label="Kind" htmlFor="wh_kind" required>
                <Select
                  id="wh_kind"
                  name="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as WarehouseKind)}
                >
                  {WAREHOUSE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k === "company" ? "Company warehouse" : "Project warehouse"}
                    </option>
                  ))}
                </Select>
              </Field>

              {kind === "project" && (
                <Field label="Project" htmlFor="wh_project" required>
                  <Select
                    id="wh_project"
                    name="project_id"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    required
                  >
                    <option value="">Choose a project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}

          <Field label="Address" htmlFor="wh_address">
            <Input id="wh_address" name="address" placeholder="Optional" />
          </Field>

          {error && (
            <p className="rounded-md border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-3 py-2 text-[13px] text-[var(--color-red)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={busy || (!isBin && kind === "project" && !projectId)}
            >
              {busy ? "Adding…" : "Add warehouse"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
