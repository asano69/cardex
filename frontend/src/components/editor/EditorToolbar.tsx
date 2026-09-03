import { For, Show } from "solid-js";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
} from "../../lib/icons";
import { useEditorDerivedValue } from "prosekit/solid";

interface ToolbarButton {
  key: string;
  label: string;
  icon: typeof Undo2;
}

// Toolbar buttons, grouped by function (history / marks), each backed by
// a ProseKit command. Kept as plain data so adding, removing, or
// reordering a formatting option is a one-line change instead of
// touching the render logic below.
const TOOLBAR_GROUPS: ToolbarButton[][] = [
  [
    { key: "undo", label: "Undo", icon: Undo2 },
    { key: "redo", label: "Redo", icon: Redo2 },
  ],
  [
    { key: "bold", label: "Bold", icon: Bold },
    { key: "italic", label: "Italic", icon: Italic },
    { key: "underline", label: "Underline", icon: UnderlineIcon },
    { key: "strike", label: "Strikethrough", icon: Strikethrough },
  ],
  [{ key: "bulletList", label: "Bullet List", icon: List }],
];

interface ToolbarItemState {
  isActive: boolean;
  canExec: boolean;
  command: () => void;
}

// Must render inside <ProseKit editor={...}>, since useEditorDerivedValue
// reads the current editor from that context.
export default function EditorToolbar() {
  // Derives { isActive, canExec, command } for every toolbar button from
  // the current editor state; re-runs on every ProseMirror transaction.
  // Inlined here (rather than a separate top-level function) so the
  // `editor` parameter's type is inferred from useEditorDerivedValue
  // instead of needing to be spelled out by hand.
  // `editor`'s extension-specific type (marks/nodes/commands available)
  // isn't inferable here since this component doesn't know which
  // extension TextEditor created the editor with, so it's left as
  // `any` rather than fighting prosekit's generics for no real benefit.
  const items = useEditorDerivedValue(
    (editor: any): Record<string, ToolbarItemState> => ({
      undo: {
        isActive: false,
        canExec: editor.commands.undo.canExec(),
        command: () => editor.commands.undo(),
      },
      redo: {
        isActive: false,
        canExec: editor.commands.redo.canExec(),
        command: () => editor.commands.redo(),
      },
      bold: {
        isActive: editor.marks.bold.isActive(),
        canExec: editor.commands.toggleBold.canExec(),
        command: () => editor.commands.toggleBold(),
      },
      italic: {
        isActive: editor.marks.italic.isActive(),
        canExec: editor.commands.toggleItalic.canExec(),
        command: () => editor.commands.toggleItalic(),
      },
      underline: {
        isActive: editor.marks.underline.isActive(),
        canExec: editor.commands.toggleUnderline.canExec(),
        command: () => editor.commands.toggleUnderline(),
      },
      strike: {
        isActive: editor.marks.strike.isActive(),
        canExec: editor.commands.toggleStrike.canExec(),
        command: () => editor.commands.toggleStrike(),
      },
      // "list" node's `kind` attribute distinguishes bullet/ordered/task
      // lists; toggleList wraps/unwraps the current block(s) accordingly.
      bulletList: {
        isActive: editor.nodes.list.isActive({ kind: "bullet" }),
        canExec: editor.commands.toggleList.canExec({ kind: "bullet" }),
        command: () => editor.commands.toggleList({ kind: "bullet" }),
      },
    }),
  );

  return (
    <div class="notes-toolbar">
      <For each={TOOLBAR_GROUPS}>
        {(group, groupIndex) => (
          <>
            {/* No divider before the first group. */}
            <Show when={groupIndex() > 0}>
              <div class="notes-toolbar-divider" />
            </Show>
            <div class="notes-toolbar-group">
              <For each={group}>
                {({ key, label, icon: Icon }) => (
                  <Show when={items()[key]}>
                    {(item) => (
                      <button
                        type="button"
                        title={label}
                        aria-label={label}
                        disabled={!item().canExec}
                        onClick={item().command}
                        classList={{ "is-active": item().isActive }}
                      >
                        <Icon size={17} />
                      </button>
                    )}
                  </Show>
                )}
              </For>
            </div>
          </>
        )}
      </For>
    </div>
  );
}
