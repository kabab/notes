// Images: `![](att:<hash>)` renders as a block below its line (the raw Markdown is
// hidden unless the cursor is on that line). Pasting or dropping image files uploads
// them and inserts the Markdown; a placeholder shows while processing.

import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Range, StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

const ATT_URL = /^att:([0-9a-f]{64})$/;

/** The attachment hash in an `att:<hash>` URL, or null. */
export function parseAttUrl(url: string): string | null {
  return ATT_URL.exec(url.trim())?.[1] ?? null;
}

export const imageMarkdown = (hash: string) => `![](att:${hash})`;

/** Text to insert at `pos` so `text` ends up on its own line. */
export function onOwnLine(doc: Text, pos: number, text: string): string {
  const before = pos > 0 && doc.sliceString(pos - 1, pos) !== "\n" ? "\n" : "";
  const after = pos < doc.length && doc.sliceString(pos, pos + 1) !== "\n" ? "\n" : "";
  return before + text + after;
}

// ---- rendering --------------------------------------------------------------

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-image-block";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.draggable = false;
    // The block's height changes once the image loads.
    img.onload = img.onerror = () => view.requestMeasure();
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() {
    return false; // clicks place the cursor, revealing the Markdown
  }
}

const hide = Decoration.replace({});

function buildImages(state: EditorState, urlFor: (hash: string) => string): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const cursorLines = new Set(state.selection.ranges.map((r) => state.doc.lineAt(r.head).number));
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Image") return;
      const urlNode = node.node.getChild("URL");
      const hash = urlNode && parseAttUrl(state.sliceDoc(urlNode.from, urlNode.to));
      if (!hash) return false;
      const line = state.doc.lineAt(node.from);
      if (!cursorLines.has(line.number)) ranges.push(hide.range(node.from, node.to));
      const raw = state.sliceDoc(node.from, node.to);
      const alt = raw.slice(2, raw.indexOf("]"));
      ranges.push(
        Decoration.widget({ widget: new ImageWidget(urlFor(hash), alt), block: true, side: 1 }).range(line.to),
      );
      return false;
    },
  });
  return Decoration.set(ranges, true);
}

// Block widgets must come from a state field (not a view plugin).
function imageField(urlFor: (hash: string) => string) {
  return StateField.define<DecorationSet>({
    create: (state) => buildImages(state, urlFor),
    update(deco, tr) {
      if (tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
        return buildImages(tr.state, urlFor);
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

// ---- uploads ------------------------------------------------------------------

const addPending = StateEffect.define<{ id: number; pos: number }>();
const removePending = StateEffect.define<number>();

class PendingWidget extends WidgetType {
  constructor(readonly id: number) {
    super();
  }
  eq(other: PendingWidget) {
    return other.id === this.id;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-image-pending";
    el.textContent = "Processing image…";
    return el;
  }
}

/** Placeholders for uploads in flight. Their positions follow edits made meanwhile. */
const pendingField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(addPending)) {
        deco = deco.update({ add: [Decoration.widget({ widget: new PendingWidget(e.value.id), side: 1 }).range(e.value.pos)] });
      } else if (e.is(removePending)) {
        deco = deco.update({ filter: (_f, _t, d) => (d.spec.widget as PendingWidget).id !== e.value });
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function pendingPos(state: EditorState, id: number): number | null {
  let found: number | null = null;
  state.field(pendingField).between(0, state.doc.length, (from, _to, d) => {
    if ((d.spec.widget as PendingWidget).id === id) found = from;
  });
  return found;
}

let nextId = 0;

export type UploadImage = (file: File) => Promise<string>; // resolves to the attachment hash

/** Uploads `files` and inserts their Markdown at `pos` (tracked through concurrent edits). */
export function insertImageFiles(view: EditorView, files: File[], pos: number, upload: UploadImage, onError: (message: string) => void) {
  for (const file of files) {
    const id = ++nextId;
    view.dispatch({ effects: addPending.of({ id, pos }) });
    upload(file).then(
      (hash) => {
        if (!view.dom.isConnected) return; // editor closed meanwhile; the attachment is stored anyway
        const at = pendingPos(view.state, id) ?? view.state.selection.main.head;
        const insert = onOwnLine(view.state.doc, at, imageMarkdown(hash));
        view.dispatch({ effects: removePending.of(id), changes: { from: at, insert } });
      },
      (err: unknown) => {
        if (view.dom.isConnected) view.dispatch({ effects: removePending.of(id) });
        onError(`Couldn't add ${file.name || "image"}: ${err instanceof Error ? err.message : String(err)}`);
      },
    );
  }
}

/** Inserts already-stored attachments at the cursor, each on its own line. */
export function insertImageHashes(view: EditorView, hashes: string[]) {
  if (hashes.length === 0) return;
  const pos = view.state.selection.main.head;
  const insert = onOwnLine(view.state.doc, pos, hashes.map(imageMarkdown).join("\n"));
  view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } });
  view.focus();
}

const imageFiles = (list: FileList | undefined | null) => [...(list ?? [])].filter((f) => f.type.startsWith("image/"));

export function images(options: { urlFor(hash: string): string; upload: UploadImage; onError(message: string): void }) {
  return [
    imageField(options.urlFor),
    pendingField,
    EditorView.domEventHandlers({
      paste(e, view) {
        const files = imageFiles(e.clipboardData?.files);
        if (files.length === 0) return false;
        e.preventDefault();
        insertImageFiles(view, files, view.state.selection.main.head, options.upload, options.onError);
        return true;
      },
      drop(e, view) {
        const files = imageFiles(e.dataTransfer?.files);
        if (files.length === 0) return false;
        e.preventDefault();
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
        insertImageFiles(view, files, pos, options.upload, options.onError);
        return true;
      },
    }),
  ];
}
