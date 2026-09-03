import { createEffect, createSignal } from "solid-js";
import { useEditorDerivedValue } from "prosekit/solid";

import SaveButton from "../SaveButton";

export interface EditorSaveButtonProps {
  saving: boolean;
  justSaved: boolean;
}

// SaveButton wired up with dirty-tracking specific to TextEditor's
// ProseKit editor. Must render inside <ProseKit editor={...}>, since
// useEditorDerivedValue reads the current editor from that context.
//
// Tracks its own "dirty" state by comparing the document's current JSON
// against a snapshot taken on mount, so the button only lights up green
// once there's something to save, and grays out again right after a
// successful save (see the justSaved effect below).
export default function EditorSaveButton(props: EditorSaveButtonProps) {
  const docJSON = useEditorDerivedValue((editor) => editor.getDocJSON());
  const [dirty, setDirty] = createSignal(false);
  let baseline: string | undefined;

  createEffect(() => {
    const current = JSON.stringify(docJSON());
    // First run just records the starting point; nothing to compare
    // against yet.
    if (baseline === undefined) {
      baseline = current;
      return;
    }
    setDirty(current !== baseline);
  });

  // Once a save completes, the just-saved content becomes the new
  // baseline, so the button grays out again until the next edit.
  createEffect(() => {
    if (props.justSaved) {
      baseline = JSON.stringify(docJSON());
      setDirty(false);
    }
  });

  return (
    <SaveButton
      saving={props.saving}
      justSaved={props.justSaved}
      dirty={dirty()}
    />
  );
}
