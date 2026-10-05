// Markdown language setup shared by the editor and the tests.
// `[[wiki links]]` are a real syntax node, so they're never detected inside code.

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";

const OPEN = 91; // [
const CLOSE = 93; // ]
const NEWLINE = 10;

export interface WikiLinkTarget {
  /** Note title the link points to (heading part stripped). */
  target: string;
  /** Text shown instead of the target, from `[[target|alias]]`. */
  alias: string | null;
}

/** Parses the text between `[[` and `]]`. Returns null when there's no usable target. */
export function parseWikiLink(inner: string): WikiLinkTarget | null {
  const bar = inner.indexOf("|");
  const rawTarget = bar === -1 ? inner : inner.slice(0, bar);
  const alias = bar === -1 ? "" : inner.slice(bar + 1).trim();
  const hash = rawTarget.indexOf("#");
  const target = (hash === -1 ? rawTarget : rawTarget.slice(0, hash)).trim();
  if (!target) return null;
  return { target, alias: alias || null };
}

/** Lezer extension adding `WikiLink` nodes (with `WikiLinkMark` children for the brackets). */
export const WikiLink: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: tags.link },
    { name: "WikiLinkMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== OPEN || cx.char(pos + 1) !== OPEN) return -1;
        for (let i = pos + 2; i < cx.end - 1; i++) {
          const c = cx.char(i);
          if (c === NEWLINE || c === OPEN) return -1;
          if (c === CLOSE) {
            if (cx.char(i + 1) !== CLOSE || !parseWikiLink(cx.slice(pos + 2, i))) return -1;
            return cx.addElement(
              cx.elt("WikiLink", pos, i + 2, [cx.elt("WikiLinkMark", pos, pos + 2), cx.elt("WikiLinkMark", i, i + 2)]),
            );
          }
        }
        return -1;
      },
    },
  ],
};

/** GFM (tables, task lists, strikethrough…) plus wiki links. */
export const markdownSupport = () => markdown({ base: markdownLanguage, extensions: [WikiLink] });
