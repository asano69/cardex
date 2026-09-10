import { describe, expect, it } from "vitest";
import { cardpotSyntaxLanguage } from "./cardpotSyntax";

// Parses `text` with the extended grammar and returns every node name
// found, in document order -- a fast, CodeMirror-free way to check
// whether a given notation is actually being recognized.
function parseNodeNames(text: string): string[] {
  const tree = cardpotSyntaxLanguage.parser.parse(text);
  const names: string[] = [];
  tree.iterate({
    enter: (node) => {
      names.push(node.name);
    },
  });
  return names;
}

describe("cardpotSyntax", () => {
  it("recognizes a wiki link", () => {
    expect(parseNodeNames("see [[Some Page]] for details")).toContain(
      "WikiLink",
    );
  });

  it("recognizes an icon bracket", () => {
    expect(parseNodeNames("bring your [apple.icon]")).toContain("IconBracket");
  });

  it("falls back to PageBracket for a bare bracket word", () => {
    expect(parseNodeNames("[Foo]")).toContain("PageBracket");
  });

  it("actually removed FencedCode via the remove list", () => {
    // If the name in disabledForNow is misspelled, `remove` silently
    // does nothing and this would still show up -- that's exactly the
    // failure mode that's hard to notice by eye.
    expect(parseNodeNames("```\ncode\n```")).not.toContain("FencedCode");
  });
});
