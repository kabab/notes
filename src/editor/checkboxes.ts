// Task list checkboxes: `- [ ]` / `- [x]` markers render as clickable checkboxes.
// Uses the GFM `TaskMarker` syntax node, so markers inside code are left alone.

import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/** True if a task marker (`[ ]`, `[x]`, `[X]`) is checked. */
export const isChecked = (marker: string) => /^\[[xX]\]$/.test(marker);

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-task-checkbox";
    box.setAttribute("aria-label", this.checked ? "Mark as not done" : "Mark as done");
    // The document is the source of truth: we toggle it in the mousedown handler.
    box.addEventListener("click", (e) => e.preventDefault());
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

const doneLine = Decoration.line({ class: "cm-task-done" });

function build(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "TaskMarker") return;
        const checked = isChecked(view.state.sliceDoc(node.from, node.to));
        ranges.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to));
        if (checked) ranges.push(doneLine.range(view.state.doc.lineAt(node.from).from));
      },
    });
  }
  return Decoration.set(ranges, true);
}

/** Flips the task marker starting at `pos`. Returns false if there's no marker there. */
export function toggleTaskAt(view: EditorView, pos: number): boolean {
  const marker = view.state.sliceDoc(pos, pos + 3);
  if (!/^\[[ xX]\]$/.test(marker)) return false;
  view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: isChecked(marker) ? " " : "x" } });
  return true;
}

export function checkboxes() {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (p) => p.decorations },
  );

  const clicks = EditorView.domEventHandlers({
    mousedown(e, view) {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("cm-task-checkbox")) return false;
      e.preventDefault();
      return toggleTaskAt(view, view.posAtDOM(target));
    },
  });

  return [plugin, clicks];
}
