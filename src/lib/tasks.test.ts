import { describe, expect, it } from "vitest";
import type { Task } from "../bindings/Task";
import { displayTaskText, groupByDoneDay, groupByNote } from "./tasks";

const task = (id: string, noteId: string, doneAt: number | null = null): Task => ({
  id,
  noteId,
  noteTitle: noteId,
  text: id,
  done: doneAt !== null,
  doneAt,
  line: 0,
});

describe("grouping", () => {
  it("groups consecutive tasks by note, keeping order", () => {
    const groups = groupByNote([task("a1", "A"), task("a2", "A"), task("b1", "B")]);
    expect(groups.map((g) => [g.key, g.tasks.map((t) => t.id)])).toEqual([
      ["A", ["a1", "a2"]],
      ["B", ["b1"]],
    ]);
  });

  it("groups done tasks by local day", () => {
    const day1 = new Date(2026, 9, 5, 23, 30).getTime();
    const day1Early = new Date(2026, 9, 5, 0, 5).getTime();
    const day0 = new Date(2026, 9, 4, 12).getTime();
    const groups = groupByDoneDay([task("x", "A", day1), task("y", "B", day1Early), task("z", "A", day0)]);
    expect(groups.map((g) => [g.key, g.tasks.length])).toEqual([
      ["2026-10-05", 2],
      ["2026-10-04", 1],
    ]);
  });
});

describe("displayTaskText", () => {
  it("renders wiki links as their label", () => {
    expect(displayTaskText("read [[Book]] and [[Other note|that]]")).toBe("read Book and that");
    expect(displayTaskText("see [[Note#Heading]]")).toBe("see Note");
    expect(displayTaskText("no links [here]")).toBe("no links [here]");
  });
});
