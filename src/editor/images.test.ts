import { Text } from "@codemirror/state";
import { GFM, parser as baseParser } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { imageMarkdown, onOwnLine, parseAttUrl } from "./images";
import { WikiLink } from "./markdown";

const HASH = "a".repeat(64);

describe("parseAttUrl", () => {
  it("accepts att: URLs with a SHA-256 hex hash", () => {
    expect(parseAttUrl(`att:${HASH}`)).toBe(HASH);
    expect(parseAttUrl(` att:${HASH} `)).toBe(HASH);
  });
  it("rejects anything else", () => {
    expect(parseAttUrl("att:abc")).toBeNull();
    expect(parseAttUrl(`att:${HASH.toUpperCase()}`)).toBeNull();
    expect(parseAttUrl(`https://x/${HASH}`)).toBeNull();
    expect(parseAttUrl(`att:${HASH}0`)).toBeNull();
  });
});

describe("onOwnLine", () => {
  const md = imageMarkdown(HASH);
  const doc = Text.of(["hello world", "", "end"]);
  it("adds line breaks only where needed", () => {
    expect(onOwnLine(doc, 0, md)).toBe(`${md}\n`); // start of a non-empty line
    expect(onOwnLine(doc, 5, md)).toBe(`\n${md}\n`); // mid-line
    expect(onOwnLine(doc, 11, md)).toBe(`\n${md}`); // end of line
    expect(onOwnLine(doc, 12, md)).toBe(md); // empty line
    expect(onOwnLine(doc, doc.length, md)).toBe(`\n${md}`); // end of document
  });
});

describe("image syntax", () => {
  it("exposes the att: URL as the Image node's URL child", () => {
    const parser = baseParser.configure([GFM, WikiLink]);
    const doc = `text\n\n${imageMarkdown(HASH)}\n\n\`![](att:${HASH})\`\n`;
    const urls: string[] = [];
    parser.parse(doc).iterate({
      enter(n) {
        if (n.name !== "Image") return;
        const url = n.node.getChild("URL");
        if (url) urls.push(doc.slice(url.from, url.to));
      },
    });
    expect(urls).toEqual([`att:${HASH}`]); // the one in inline code is ignored
  });
});
