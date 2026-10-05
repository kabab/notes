import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Classes only; colors and sizes live in styles.css so light/dark mode is handled there.
export const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, class: "cm-h1" },
  { tag: t.heading2, class: "cm-h2" },
  { tag: t.heading3, class: "cm-h3" },
  { tag: [t.heading4, t.heading5, t.heading6], class: "cm-h4" },
  { tag: t.strong, class: "cm-strong" },
  { tag: t.emphasis, class: "cm-em" },
  { tag: t.strikethrough, class: "cm-strike" },
  { tag: [t.link, t.url], class: "cm-link" },
  { tag: t.monospace, class: "cm-code" },
  { tag: t.quote, class: "cm-quote" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], class: "cm-mark" },
  { tag: t.list, class: "cm-list" },
]);
