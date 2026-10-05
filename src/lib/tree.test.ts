import { describe, expect, it } from "vitest";
import type { Folder } from "../bindings/Folder";
import type { NoteSummary } from "../bindings/NoteSummary";
import { buildTree, folderPath, isWithin } from "./tree";

const folder = (id: string, parentId: string | null = null): Folder => ({
  id,
  parentId,
  name: id,
  createdAt: 0,
  updatedAt: 0,
});
const note = (id: string, folderId: string | null = null): NoteSummary => ({
  id,
  folderId,
  title: id,
  date: null,
  updatedAt: 0,
});

describe("buildTree", () => {
  it("nests folders and notes, keeping order", () => {
    const tree = buildTree(
      [folder("a"), folder("b", "a"), folder("c", "a"), folder("d")],
      [note("n1"), note("n2", "b"), note("n3", "a")],
    );
    expect(tree.folders.map((n) => n.folder.id)).toEqual(["a", "d"]);
    const a = tree.folders[0]!;
    expect(a.children.map((n) => n.folder.id)).toEqual(["b", "c"]);
    expect(a.notes.map((n) => n.id)).toEqual(["n3"]);
    expect(a.children[0]!.notes.map((n) => n.id)).toEqual(["n2"]);
    expect(tree.notes.map((n) => n.id)).toEqual(["n1"]);
  });

  it("puts orphans at the root", () => {
    const tree = buildTree([folder("x", "missing")], [note("n", "missing")]);
    expect(tree.folders.map((n) => n.folder.id)).toEqual(["x"]);
    expect(tree.notes.map((n) => n.id)).toEqual(["n"]);
  });
});

describe("folderPath", () => {
  it("returns ancestors root first", () => {
    const folders = [folder("a"), folder("b", "a"), folder("c", "b")];
    expect(folderPath(folders, "c").map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(folderPath(folders, null)).toEqual([]);
  });

  it("survives a cycle in bad data", () => {
    const folders = [folder("a", "b"), folder("b", "a")];
    expect(folderPath(folders, "a").map((f) => f.id)).toEqual(["b", "a"]);
  });
});

describe("isWithin", () => {
  const folders = [folder("a"), folder("b", "a"), folder("c")];
  it("matches self and descendants only", () => {
    expect(isWithin(folders, "a", "a")).toBe(true);
    expect(isWithin(folders, "b", "a")).toBe(true);
    expect(isWithin(folders, "c", "a")).toBe(false);
    expect(isWithin(folders, null, "a")).toBe(false);
  });
});
