import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { insertNewlineKeepingBullet } from "./bulletEnter";

// insertNewlineKeepingBullet only reads `view.state` and calls
// `view.dispatch(tr)` -- it never touches the DOM -- so a plain fake
// object satisfying that shape is enough to exercise it, with no need
// to construct a real EditorView (and therefore no jsdom dependency).
function runCommand(doc: string, cursor: number) {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
  });

  let result: EditorState = state;
  const fakeView = {
    state,
    dispatch(tr: import("@codemirror/state").Transaction) {
      result = tr.state;
    },
  } as unknown as EditorView;

  insertNewlineKeepingBullet(fakeView);
  return result;
}

describe("insertNewlineKeepingBullet", () => {
  it("inserts a plain newline on an unindented line", () => {
    const result = runCommand("hello", 5);
    expect(result.doc.toString()).toBe("hello\n");
    expect(result.selection.main.head).toBe(6);
  });

  it("keeps the same bullet depth when the line has text", () => {
    const result = runCommand("\t\thello", 7);
    expect(result.doc.toString()).toBe("\t\thello\n\t\t");
    expect(result.selection.main.head).toBe(10);
  });

  it("releases bullet mode and still inserts a newline on an empty bullet", () => {
    const result = runCommand("\t\t", 2);
    expect(result.doc.toString()).toBe("\n");
    expect(result.selection.main.head).toBe(1);
  });

  it("releases bullet mode for a single-tab empty bullet", () => {
    const result = runCommand("\t", 1);
    expect(result.doc.toString()).toBe("\n");
    expect(result.selection.main.head).toBe(1);
  });

  it("only considers the current line's depth, not other lines", () => {
    // Cursor is on the second line ("\t\tbar"); the first line's
    // deeper indent ("\t\t\tfoo") must not leak into this line's
    // computed depth.
    const doc = "\t\t\tfoo\n\t\tbar";
    const cursorPos = doc.length; // end of "bar"
    const result = runCommand(doc, cursorPos);
    expect(result.doc.toString()).toBe("\t\t\tfoo\n\t\tbar\n\t\t");
  });

  it("treats a bullet line with only whitespace after the tabs as empty", () => {
    const result = runCommand("\t\t   ", 5);
    expect(result.doc.toString()).toBe("\n");
    expect(result.selection.main.head).toBe(1);
  });
});
