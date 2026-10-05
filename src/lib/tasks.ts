import type { Task } from "../bindings/Task";
import { todayISO } from "./date";

export interface Group<K> {
  key: K;
  tasks: Task[];
}

/** Consecutive grouping that keeps the backend's order. */
function groupBy<K>(tasks: Task[], keyOf: (t: Task) => K): Group<K>[] {
  const groups: Group<K>[] = [];
  for (const task of tasks) {
    const key = keyOf(task);
    const last = groups.at(-1);
    if (last && last.key === key) last.tasks.push(task);
    else groups.push({ key, tasks: [task] });
  }
  return groups;
}

/** Open tasks grouped by note (the list arrives sorted by note). */
export const groupByNote = (tasks: Task[]) => groupBy(tasks, (t) => t.noteId);

/** Done tasks grouped by local completion day (`YYYY-MM-DD`). */
export const groupByDoneDay = (tasks: Task[]) =>
  groupBy(tasks, (t) => (t.doneAt === null ? "" : todayISO(new Date(t.doneAt))));

/** Task text for display: `[[target|alias]]` → `alias`, `[[target]]` → `target`. */
export function displayTaskText(text: string): string {
  return text.replace(/\[\[([^[\]|\n]+)(?:\|([^[\]\n]*))?\]\]/g, (_, target: string, alias?: string) =>
    (alias?.trim() || target.split("#")[0]!).trim(),
  );
}
