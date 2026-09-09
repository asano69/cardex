// Raw ProseMirror schema for the note editor, replacing ProseKit's
// defineNoteExtension() (see basicExtension.ts, which this will
// eventually replace once the EditorView mounting is also migrated —
// see index.tsx). Built directly from prosemirror-model instead of
// ProseKit's DSL, so this has no dependency on prosekit/core.
//
// List nodes come from prosemirror-flat-list's own createListSpec(),
// and table nodes from prosemirror-tables' tableNodes() — both
// packages already ship their own NodeSpec, so there is nothing to
// hand-write for either.
import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";
import { createListSpec } from "prosemirror-flat-list";
import { tableNodes } from "prosemirror-tables";

// Adds a "data-block-id" attribute to a textblock node's spec. Only
// textblock types (paragraph, heading, codeBlock) get one — see
// lines.go's textblockTags, which this must stay in sync with. The
// attribute is populated by blockIdPlugin.ts, not here; this only
// declares that the schema carries it.
function withBlockId(spec: NodeSpec): NodeSpec {
  return {
    ...spec,
    attrs: { ...spec.attrs, id: { default: null } },
    toDOM(node) {
      const [tag, domAttrs, ...rest] = spec.toDOM!(node) as [
        string,
        Record<string, unknown>,
        ...unknown[],
      ];
      const withId = node.attrs.id
        ? { ...domAttrs, "data-block-id": node.attrs.id }
        : domAttrs;
      return [tag, withId, ...rest];
    },
    parseDOM: spec.parseDOM?.map((rule) => ({
      ...rule,
      getAttrs(dom: HTMLElement) {
        const base =
          typeof rule.getAttrs === "function" ? rule.getAttrs(dom) : {};
        if (base === false) return false;
        return { ...base, id: dom.getAttribute("data-block-id") };
      },
    })),
  };
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },

  text: { group: "inline" },

  paragraph: withBlockId({
    content: "inline*",
    group: "block",
    parseDOM: [{ tag: "p" }],
    toDOM: () => ["p", {}, 0],
  }),

  heading: withBlockId({
    attrs: { level: { default: 1 } },
    content: "inline*",
    group: "block",
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      attrs: { level },
    })),
    toDOM: (node) => [`h${node.attrs.level}`, {}, 0],
  }),

  codeBlock: withBlockId({
    content: "text*",
    group: "block",
    marks: "",
    code: true,
    defining: true,
    parseDOM: [{ tag: "pre", preserveWhitespace: "full" as const }],
    toDOM: () => ["pre", {}, ["code", 0]],
  }),

  // Containers only — no block id of their own (see lines.go).
  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM: () => ["blockquote", {}, 0],
  },

  list: createListSpec(),

  horizontalRule: {
    group: "block",
    parseDOM: [{ tag: "hr" }],
    toDOM: () => ["hr"],
  },

  hardBreak: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },

  image: {
    inline: false,
    group: "block",
    attrs: { src: {}, alt: { default: null } },
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs: (dom: HTMLElement) => ({
          src: dom.getAttribute("src"),
          alt: dom.getAttribute("alt"),
        }),
      },
    ],
    toDOM: (node) => ["img", { src: node.attrs.src, alt: node.attrs.alt }],
  },

  ...tableNodes({ tableGroup: "block", cellContent: "block+" }),
};

const marks: Record<string, MarkSpec> = {
  italic: {
    parseDOM: [{ tag: "i" }, { tag: "em" }, { style: "font-style=italic" }],
    toDOM: () => ["em"],
  },
  bold: {
    parseDOM: [{ tag: "strong" }, { tag: "b" }],
    toDOM: () => ["strong"],
  },
  underline: {
    parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
    toDOM: () => ["u"],
  },
  strike: {
    parseDOM: [{ tag: "s" }, { tag: "strike" }],
    toDOM: () => ["s"],
  },
  code: {
    parseDOM: [{ tag: "code" }],
    toDOM: () => ["code"],
    excludes: "_",
  },
  // Only the mark schema + basic toDOM/parseDOM — auto-link detection
  // stays in urlLinkRule.ts (a plain Plugin), same as before.
  link: {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom: HTMLElement) => ({ href: dom.getAttribute("href") }),
      },
    ],
    toDOM: (mark) => ["a", { href: mark.attrs.href }],
  },
};

export const noteSchema = new Schema({ nodes, marks });
