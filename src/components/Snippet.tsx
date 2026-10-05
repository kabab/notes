import { splitSnippet } from "../lib/snippet";

/** Search snippet with matches highlighted. Note text is rendered as text, never HTML. */
export function Snippet({ text }: { text: string }) {
  return (
    <>
      {splitSnippet(text).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-700/60">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
