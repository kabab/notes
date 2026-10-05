/** Splits a search snippet (matches wrapped in \u0001…\u0002) into plain/highlighted parts. */
export function splitSnippet(snippet: string): { text: string; match: boolean }[] {
  const parts: { text: string; match: boolean }[] = [];
  for (const [i, chunk] of snippet.split("\u0001").entries()) {
    if (i === 0) {
      if (chunk) parts.push({ text: chunk, match: false });
      continue;
    }
    const end = chunk.indexOf("\u0002");
    const [match, rest] = end === -1 ? [chunk, ""] : [chunk.slice(0, end), chunk.slice(end + 1)];
    if (match) parts.push({ text: match, match: true });
    if (rest) parts.push({ text: rest, match: false });
  }
  return parts;
}
