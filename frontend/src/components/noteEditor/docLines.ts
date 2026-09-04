// Converts between the plain "one string per line" storage format used
// by the cards collection's `content` field, and the ProseKit doc JSON
// the editor actually edits. Each line becomes its own paragraph node;
// a document always has at least one paragraph, since ProseKit's basic
// schema requires a non-empty doc.
export function linesToDocJSON(lines: string[]) {
  const paragraphs = lines.length > 0 ? lines : [""];
  return {
    type: "doc",
    content: paragraphs.map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}

// Inverse of linesToDocJSON: reads the editor's doc JSON back out as one
// string per top-level block.
export function docToLines(doc: any): string[] {
  const nodes: any[] = doc?.content ?? [];
  return nodes.map(textOf);
}

function textOf(node: any): string {
  if (node.type === "text") return node.text ?? "";
  const children: any[] = node.content ?? [];
  return children.map(textOf).join("");
}
