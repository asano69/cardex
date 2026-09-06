import { Plugin } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";

import { v7 as uuidv7 } from "uuid";
// Assigns a UUIDv7 block id to any paragraph/heading/blockquote/codeBlock
// node that doesn't already have one (see defineBlockIdAttr in
// basicExtension.ts for which node types carry the "id" attr). Runs as
// an appendTransaction so it catches every new block regardless of how
// it was created -- typing Enter locally, or a remote peer's edit
// arriving through ySyncPlugin -- and self-heals older cards synced
// before this attribute existed, same pattern as
// forceFirstHeadingPlugin.
//
// Yjs note: appendTransaction runs independently in every connected
// client, so two peers creating a sibling block "at the same time" can
// each mint a different id for what is, from their own view, the same
// new node. y-prosemirror's CRDT sync still converges both clients to
// one final document (Yjs attribute writes are last-writer-wins), so
// this never corrupts anything -- worst case is a few seconds where
// the still-converging doc briefly shows two ids before settling on
// one.
export function blockIdPlugin() {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      let tr: Transaction | null = null;
      newState.doc.descendants((node, pos) => {
        if ("id" in node.attrs && node.attrs.id == null) {
          tr = (tr ?? newState.tr).setNodeAttribute(pos, "id", uuidv7());
        }
      });
      return tr;
    },
  });
}
