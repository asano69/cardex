import { createEffect, createSignal, onCleanup } from "solid-js";
import "prosekit/basic/style.css";
import "prosekit/basic/typography.css";
import { defineBasicExtension } from "prosekit/basic";
import { createEditor } from "prosekit/core";
import { ProseKit, useEditorDerivedValue } from "prosekit/solid";

import SaveButton from "../SaveButton";
import { docToLines, linesToDocJSON } from "./docLines";

export interface NoteEditorProps {
  initialTitle?: string;
  // Newline-separated lines, matching the storage format of the
  // "content" field (see docLines.ts for the ProseKit doc conversion).
  initialContent?: string;
  onSave: (data: { title: string; content: string }) => Promise<void>;
  errorMessage?: string;
}

// Title input + ProseKit rich-text body, combined into a single
// self-contained editor: it owns ProseKit setup, doc<->lines
// conversion, and its own save button with dirty-tracking. Callers
// only need to supply the initial values and an onSave handler.
export default function NoteEditor(props: NoteEditorProps) {
  // Read once on mount: callers remount NoteEditor (e.g. via <Show>)
  // whenever the initial values actually change, so nothing here needs
  // to react to prop updates afterwards.
  // eslint-disable-next-line solid/reactivity
  const initialTitle = props.initialTitle ?? "";
  const [title, setTitle] = createSignal(initialTitle);

  const editor = createEditor({
    extension: defineBasicExtension(),
    // eslint-disable-next-line solid/reactivity
    defaultContent: linesToDocJSON(
      props.initialContent ? props.initialContent.split("\n") : [],
    ),
  });

  const [saving, setSaving] = createSignal(false);
  const [justSaved, setJustSaved] = createSignal(false);
  const [error, setError] = createSignal("");

  // Solid doesn't auto-unmount ref callbacks the way React's new
  // ref-cleanup convention does, so the returned unmount function is
  // wired to onCleanup explicitly here.
  const mountEditor = (el: HTMLDivElement) => {
    const unmount = editor.mount(el);
    onCleanup(() => {
      if (typeof unmount === "function") unmount();
    });
  };

  const handleSave = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title().trim()) return;
    setError("");
    setSaving(true);
    setJustSaved(false);
    try {
      await props.onSave({
        title: title().trim(),
        content: docToLines(editor.getDocJSON()).join("\n").trim(),
      });
      setJustSaved(true);
    } catch {
      setError(props.errorMessage ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProseKit editor={editor}>
      <form
        onSubmit={handleSave}
        class="m-6 flex min-h-0 w-full flex-1 flex-col gap-4"
      >
        <div class="flex flex-1 flex-col bg-field shadow-md">
          <input
            type="text"
            placeholder="Title"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            required
            autofocus
            class="w-full bg-transparent px-3 pt-3 pb-2 text-2xl outline-none"
          />
          <div
            ref={mountEditor}
            class="ProseMirror flex-1 overflow-y-auto p-3 pb-10 text-text outline-none"
          />
        </div>

        <SaveArea
          initialTitle={initialTitle}
          title={title}
          saving={saving}
          justSaved={justSaved}
        />

        {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}
      </form>
    </ProseKit>
  );
}

interface SaveAreaProps {
  initialTitle: string;
  title: () => string;
  saving: () => boolean;
  justSaved: () => boolean;
}

// Dirty-tracking submit button, split out from NoteEditor because
// useEditorDerivedValue must run inside <ProseKit editor={...}>, which
// isn't available yet in NoteEditor's own render body. Tracks both the
// doc JSON and the title against their values at mount (or at the last
// successful save), so the button only lights up once there's
// something new to save.
function SaveArea(props: SaveAreaProps) {
  const docJSON = useEditorDerivedValue((editor) => editor.getDocJSON());
  const [docDirty, setDocDirty] = createSignal(false);
  let baseline: string | undefined;

  createEffect(() => {
    const current = JSON.stringify(docJSON());
    // First run just records the starting point; nothing to compare
    // against yet.
    if (baseline === undefined) {
      baseline = current;
      return;
    }
    setDocDirty(current !== baseline);
  });

  // Once a save completes, the just-saved content becomes the new
  // baseline, so the button grays out again until the next edit.
  createEffect(() => {
    if (props.justSaved()) {
      baseline = JSON.stringify(docJSON());
      setDocDirty(false);
    }
  });

  const dirty = () =>
    docDirty() || props.title().trim() !== props.initialTitle;

  return (
    <SaveButton
      saving={props.saving()}
      justSaved={props.justSaved()}
      dirty={dirty()}
    />
  );
}
