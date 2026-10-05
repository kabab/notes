import { GFM, parser as baseParser } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { isChecked } from "./checkboxes";
import { parseWikiLink, WikiLink } from "./markdown";

// Same grammar the editor uses: GFM + wiki links.
const parser = baseParser.configure([GFM, WikiLink]);

/** Text of every node named `name` in `doc`. */
function nodes(doc: string, name: string): string[] {
  const out: string[] = [];
  parser.parse(doc).iterate({
    enter(n) {
      if (n.name === name) out.push(doc.slice(n.from, n.to));
    },
  });
  return out;
}

describe("parseWikiLink", () => {
  it("parses target, alias and heading", () => {
    expect(parseWikiLink("Reading list")).toEqual({ target: "Reading list", alias: null });
    expect(parseWikiLink(" Books | my books ")).toEqual({ target: "Books", alias: "my books" });
    expect(parseWikiLink("Books#Fiction")).toEqual({ target: "Books", alias: null });
    expect(parseWikiLink("Books|")).toEqual({ target: "Books", alias: null });
  });

  it("rejects empty targets", () => {
    expect(parseWikiLink("")).toBeNull();
    expect(parseWikiLink("   ")).toBeNull();
    expect(parseWikiLink("|alias")).toBeNull();
    expect(parseWikiLink("#heading")).toBeNull();
  });
});

describe("WikiLink syntax", () => {
  it("finds links in paragraphs, lists and headings", () => {
    const doc = "See [[One]] and [[Two|2]].\n\n- item [[Three]]\n\n# [[Four]]\n";
    expect(nodes(doc, "WikiLink")).toEqual(["[[One]]", "[[Two|2]]", "[[Three]]", "[[Four]]"]);
  });

  it("ignores code", () => {
    const doc = "`[[inline]]`\n\n```\n[[fenced]]\n```\n\n    [[indented]]\n";
    expect(nodes(doc, "WikiLink")).toEqual([]);
  });

  it("rejects malformed links", () => {
    expect(nodes("[[]] [[ ]] [[open] [[a\nb]] [[a[b]]", "WikiLink")).toEqual([]);
  });

  it("does not turn into a regular link", () => {
    expect(nodes("[[Note]](http://x)", "WikiLink")).toEqual(["[[Note]]"]);
  });
});

describe("TaskMarker (GFM task lists)", () => {
  it("finds top-level, nested and indented tasks", () => {
    const doc = ["- [ ] top", "  - [x] nested", "    - [X] deeper", "1. [ ] ordered", "* [ ] star"].join("\n");
    expect(nodes(doc, "TaskMarker")).toEqual(["[ ]", "[x]", "[X]", "[ ]", "[ ]"]);
  });

  it("ignores checkboxes in code blocks and plain text", () => {
    const doc = ["```", "- [ ] fenced", "```", "", "    - [ ] indented code", "", "not a list [ ] here", "`- [ ] inline`"].join("\n");
    expect(nodes(doc, "TaskMarker")).toEqual([]);
  });

  it("requires a space after the marker", () => {
    expect(nodes("- [ ]no space\n- []\n- [y] other", "TaskMarker")).toEqual([]);
  });
});

describe("isChecked", () => {
  it("accepts x and X only", () => {
    expect(isChecked("[x]")).toBe(true);
    expect(isChecked("[X]")).toBe(true);
    expect(isChecked("[ ]")).toBe(false);
  });
});
