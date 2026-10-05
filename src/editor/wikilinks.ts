// `[[links]]`: rendered as links when the cursor is elsewhere (brackets hidden,
// alias shown), raw while editing. Click a rendered link, or ⌘-click any link, to open it.

import type { CompletionSource } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { parseWikiLink } from "./markdown";

const hidden = Decoration.replace({});

function linkMark(target: string, rendered: boolean) {
  return Decoration.mark({
    class: rendered ? "cm-wikilink cm-wikilink-rendered" : "cm-wikilink",
    attributes: { "data-target": target, title: rendered ? target : `⌘-click to open ${target}` },
  });
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "WikiLink") return;
        const innerFrom = node.from + 2;
        const innerTo = node.to - 2;
        const inner = state.sliceDoc(innerFrom, innerTo);
        const link = parseWikiLink(inner);
        if (!link) return false;

        const editing = view.hasFocus && state.selection.ranges.some((r) => r.from <= node.to && r.to >= node.from);
        if (editing) {
          ranges.push(linkMark(link.target, false).range(innerFrom, innerTo));
        } else {
          const shownFrom = link.alias ? innerFrom + inner.indexOf("|") + 1 : innerFrom;
          ranges.push(hidden.range(node.from, shownFrom));
          ranges.push(linkMark(link.target, true).range(shownFrom, innerTo));
          ranges.push(hidden.range(innerTo, node.to));
        }
        return false;
      },
    });
  }
  return Decoration.set(ranges, true);
}

export function wikiLinks(onOpen: (target: string) => void) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          u.focusChanged ||
          syntaxTree(u.startState) !== syntaxTree(u.state)
        ) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (p) => p.decorations },
  );

  const clicks = EditorView.domEventHandlers({
    mousedown(e) {
      const el = (e.target as HTMLElement).closest<HTMLElement>(".cm-wikilink");
      if (!el?.dataset.target) return false;
      if (!el.classList.contains("cm-wikilink-rendered") && !(e.metaKey || e.ctrlKey)) return false;
      e.preventDefault();
      onOpen(el.dataset.target);
      return true;
    },
  });

  return [plugin, clicks];
}

/** Autocompletes note titles after `[[`, closing the link if needed. */
export function wikiLinkCompletion(titles: () => string[]): CompletionSource {
  return (ctx) => {
    const match = ctx.matchBefore(/\[\[[^[\]|\n]*/);
    if (!match) return null;
    return {
      from: match.from + 2,
      validFor: /^[^[\]|\n]*$/,
      options: [...new Set(titles())].map((title) => ({
        label: title,
        apply(view: EditorView, _c: unknown, from: number, to: number) {
          const closed = view.state.sliceDoc(to, to + 2) === "]]";
          view.dispatch({
            changes: { from, to, insert: closed ? title : `${title}]]` },
            selection: { anchor: from + title.length + 2 },
          });
        },
      })),
    };
  };
}
