import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Text } from "@codemirror/state";
import { drawSelection, dropCursor, EditorView, keymap, placeholder } from "@codemirror/view";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";
import { checkboxes } from "./checkboxes";
import { images, insertImageHashes } from "./images";
import { markdownSupport } from "./markdown";
import { highlightStyle } from "./theme";
import { wikiLinkCompletion, wikiLinks } from "./wikilinks";

export interface EditorHandle {
  focus(): void;
  /** Inserts stored attachments at the cursor. */
  insertImages(hashes: string[]): void;
}

interface Props {
  /** Initial content. The editor owns the document afterwards; remount (key) to load another note. */
  initialDoc: string;
  /** 0-based line to put the cursor on (and scroll to) when opening. */
  initialLine?: number;
  onChange(doc: Text): void;
  onOpenLink(target: string): void;
  /** Note titles offered after typing `[[`. */
  linkTitles(): string[];
  /** Stores a pasted/dropped image; resolves to its attachment hash. */
  uploadImage(file: File): Promise<string>;
  imageUrl(hash: string): string;
  onError(message: string): void;
  ref?: Ref<EditorHandle>;
}

export function Editor({
  initialDoc,
  initialLine,
  onChange,
  onOpenLink,
  linkTitles,
  uploadImage,
  imageUrl,
  onError,
  ref,
}: Props) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);

  // Extensions are created once; read the latest callbacks through a ref.
  const props = useRef({ onChange, onOpenLink, linkTitles, uploadImage, imageUrl, onError });
  props.current = { onChange, onOpenLink, linkTitles, uploadImage, imageUrl, onError };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => view.current?.focus(),
      insertImages: (hashes) => view.current && insertImageHashes(view.current, hashes),
    }),
    [],
  );

  useEffect(() => {
    const v = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdownSupport(),
          syntaxHighlighting(highlightStyle),
          EditorView.lineWrapping,
          placeholder("Start writing…"),
          autocompletion({ override: [wikiLinkCompletion(() => props.current.linkTitles())], icons: false }),
          wikiLinks((target) => props.current.onOpenLink(target)),
          checkboxes(),
          images({
            urlFor: (hash) => props.current.imageUrl(hash),
            upload: (file) => props.current.uploadImage(file),
            onError: (message) => props.current.onError(message),
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) props.current.onChange(u.state.doc);
          }),
        ],
      }),
    });
    view.current = v;
    if (initialLine !== undefined && Number.isInteger(initialLine) && initialLine >= 0) {
      const line = v.state.doc.line(Math.min(initialLine + 1, v.state.doc.lines));
      v.dispatch({ selection: { anchor: line.to }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
      v.focus();
    }
    return () => {
      v.destroy();
      view.current = null;
    };
    // Created once per mount: the parent keys this component by note id.
  }, []);

  return <div ref={parent} className="min-h-0 flex-1" />;
}
