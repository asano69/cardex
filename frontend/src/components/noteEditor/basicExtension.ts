// A local copy of prosekit/basic's defineBasicExtension(), customized to
// swap the bundled `link` extension for just its mark schema and
// commands (no auto-detection rules). Auto-linking is handled by our
// own urlLinkRule.ts instead, which only recognizes URLs with an
// explicit http(s):// scheme -- unlike prosekit's built-in rules, which
// also treat bare "word.tld" text (any real gTLD, e.g. "goog.com") as a
// link, yet can't recognize schemeless dev hosts like "localhost".
// ProseKit's own docs for defineBasicExtension() suggest exactly this:
// "You can copy this function and customize it to your needs."
import {
  defineBaseCommands,
  defineBaseKeymap,
  defineHistory,
  defineNodeAttr,
  union,
} from "prosekit/core";
import { defineBlockquote } from "prosekit/extensions/blockquote";
import { defineBold } from "prosekit/extensions/bold";
import { defineCode } from "prosekit/extensions/code";
import { defineCodeBlock } from "prosekit/extensions/code-block";
import { defineDoc } from "prosekit/extensions/doc";
import { defineGapCursor } from "prosekit/extensions/gap-cursor";
import { defineHardBreak } from "prosekit/extensions/hard-break";
import { defineHeading } from "prosekit/extensions/heading";
import { defineHorizontalRule } from "prosekit/extensions/horizontal-rule";
import { defineImage } from "prosekit/extensions/image";
import { defineItalic } from "prosekit/extensions/italic";
import { defineLinkCommands, defineLinkSpec } from "prosekit/extensions/link";
import { defineList } from "prosekit/extensions/list";
import { defineModClickPrevention } from "prosekit/extensions/mod-click-prevention";
import { defineParagraph } from "prosekit/extensions/paragraph";
import { defineStrike } from "prosekit/extensions/strike";
import { defineTable } from "prosekit/extensions/table";
import { defineText } from "prosekit/extensions/text";
import { defineUnderline } from "prosekit/extensions/underline";
import { defineVirtualSelection } from "prosekit/extensions/virtual-selection";

// Adds an `id` attribute (rendered/parsed as `data-block-id`) to a node
// type, so each block instance can carry a stable identifier for the
// current editing session. Actual id assignment happens in
// blockIdPlugin.ts, not here -- this only makes the schema aware that
// the attribute exists. splittable is intentionally left unset: a
// block created by pressing Enter should start with id: null (a fresh
// block), not inherit the id of the block it was split from.
function defineBlockIdAttr(type: string) {
  return defineNodeAttr({
    type,
    attr: "id",
    default: null,
    toDOM: (value) => (value ? ["data-block-id", value] : undefined),
    parseDOM: (dom) => dom.getAttribute("data-block-id"),
  });
}

export function defineNoteExtension() {
  return union(
    // Nodes
    defineDoc(),
    defineText(),
    defineParagraph(),
    defineHeading(),
    defineList(),
    defineBlockquote(),
    defineImage(),
    defineHorizontalRule(),
    defineHardBreak(),
    defineTable(),
    defineCodeBlock(),
    // Per-block UUIDv7 ids (see blockIdPlugin.ts). Only textblock node
    // types get one -- blockquote is a container (it wraps another
    // block, e.g. a paragraph, rather than holding text itself), so it
    // has no line of its own in card_lines (see internal/serve/lines.go)
    // and doesn't need an id. Add more calls here if other textblock
    // types also need a stable id.
    defineBlockIdAttr("paragraph"),
    defineBlockIdAttr("heading"),
    defineBlockIdAttr("codeBlock"),
    // Marks
    defineItalic(),
    defineBold(),
    defineUnderline(),
    defineStrike(),
    defineCode(),
    defineLinkSpec(),
    defineLinkCommands(),
    // Others
    defineBaseKeymap(),
    defineBaseCommands(),
    defineHistory(),
    defineGapCursor(),
    defineVirtualSelection(),
    defineModClickPrevention(),
  );
}
