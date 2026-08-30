import { describe, it, expect } from "vitest";
import {
  clientApprovalOf,
  fileKind,
  formatBytes,
  groupFilesByFolder,
  internalStatusOf,
  type ProjectFolder,
} from "./project-files-model";

const folders: ProjectFolder[] = [
  { id: "f1", project_id: "p1", name: "2D", created_at: "2026-01-01" },
  { id: "f2", project_id: "p1", name: "3D", created_at: "2026-01-01" },
];

describe("groupFilesByFolder", () => {
  it("groups files under their own folder", () => {
    const groups = groupFilesByFolder(
      [{ folder_id: "f1", id: "a" }, { folder_id: "f2", id: "b" }],
      folders,
    );
    expect(groups.map((g) => g.folder?.name)).toEqual(["2D", "3D"]);
  });

  it("never renders a file under another project's folder", () => {
    // The invariant the owner asked for: project 1 and project 2 cannot share
    // folders. A file pointing at a folder outside THIS project's list falls
    // into Unfiled rather than being drawn under someone else's folder.
    const groups = groupFilesByFolder(
      [{ folder_id: "other-project-folder", id: "a" }],
      folders,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].folder).toBe(null);
  });

  it("puts loose files last, under no folder", () => {
    const groups = groupFilesByFolder(
      [{ folder_id: null, id: "loose" }, { folder_id: "f1", id: "a" }],
      folders,
    );
    expect(groups.map((g) => g.folder?.name ?? "unfiled")).toEqual(["2D", "unfiled"]);
  });

  it("omits a folder that holds nothing rather than drawing an empty band", () => {
    const groups = groupFilesByFolder([{ folder_id: "f1", id: "a" }], folders);
    expect(groups).toHaveLength(1);
  });

  it("handles a project with no files", () => {
    expect(groupFilesByFolder([], folders)).toEqual([]);
  });
});

describe("the two lifecycles", () => {
  it("reads an internal status, defaulting to draft", () => {
    expect(internalStatusOf({ internal_status: "approved" })).toBe("approved");
    expect(internalStatusOf({ internal_status: "nonsense" })).toBe("draft");
  });

  it("reads a client approval, defaulting to not shared", () => {
    expect(clientApprovalOf({ client_approval: "revision_requested" })).toBe(
      "revision_requested",
    );
    expect(clientApprovalOf({ client_approval: "" })).toBe("not_shared");
  });

  it("keeps them independent — approved internally is not approved by the client", () => {
    const file = { internal_status: "approved", client_approval: "not_shared" };
    expect(internalStatusOf(file)).toBe("approved");
    expect(clientApprovalOf(file)).toBe("not_shared");
  });
});

describe("formatBytes", () => {
  it("scales through the units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(90_050)).toBe("87.9 KB");
    expect(formatBytes(16_800_000)).toBe("16.02 MB");
  });

  it("survives a string, which is what PostgREST returns for bigint", () => {
    expect(formatBytes("2048")).toBe("2.0 KB");
  });

  it("shows nothing as 0 B rather than NaN", () => {
    expect(formatBytes(null)).toBe("0 B");
    expect(formatBytes(Number("x"))).toBe("0 B");
  });
});

describe("fileKind", () => {
  it("classifies what a construction firm actually exchanges", () => {
    expect(fileKind("image/png")).toBe("image");
    expect(fileKind("application/pdf")).toBe("pdf");
    expect(fileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("sheet");
    expect(fileKind("image/vnd.dwg")).toBe("cad");
    expect(fileKind("application/zip")).toBe("archive");
  });

  it("does not mistake a DWG for a picture", () => {
    expect(fileKind("image/vnd.dxf")).toBe("cad");
  });

  it("falls back for the unknown", () => {
    expect(fileKind(null)).toBe("other");
  });
});
