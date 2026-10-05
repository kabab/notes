import { describe, expect, it } from "vitest";
import { splitSnippet } from "./snippet";

describe("splitSnippet", () => {
  it("splits matches from plain text", () => {
    expect(splitSnippet("the \u0001quick\u0002 brown \u0001fox\u0002")).toEqual([
      { text: "the ", match: false },
      { text: "quick", match: true },
      { text: " brown ", match: false },
      { text: "fox", match: true },
    ]);
  });

  it("handles no matches, empty input and an unterminated marker", () => {
    expect(splitSnippet("plain")).toEqual([{ text: "plain", match: false }]);
    expect(splitSnippet("")).toEqual([]);
    expect(splitSnippet("a \u0001b")).toEqual([
      { text: "a ", match: false },
      { text: "b", match: true },
    ]);
  });

  it("never produces HTML", () => {
    expect(splitSnippet("<b>\u0001x\u0002</b>").map((p) => p.text).join("")).toBe("<b>x</b>");
  });
});
