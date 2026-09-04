import { createEffect, createSignal, onCleanup } from "solid-js";
import "prosekit/basic/style.css";
import "prosekit/basic/typography.css";
import { defineBasicExtension } from "prosekit/basic";
import { createEditor } from "prosekit/core";
import { ProseKit, useEditorDerivedValue } from "prosekit/solid";

import { docToLines, linesToDocJSON } from "./docLines";

// How long to wait after the last edit before autosaving. AutoSave's
// flush (wired to onFocusOut below) saves immediately instead of
// waiting for this timeout whenever a field loses focus.
const AUTOSAVE_DEBOUNCE_MS = 1000;

export interface NoteEditorProps {
  initialTitle?: string;
  // Newline-separated lines, matching the storage format of the
  // "content" field (see docLines.ts for the ProseKit doc conversion).
  initialContent?: string;
  onSave: (data: { title: string; content: string }) => Promise<void>;
}

// Title input + ProseKit rich-text body, combined into a single
// self-contained editor: it owns ProseKit setup, doc<->lines
// conversion, and autosaving. There is no manual save button -- every
// edit is saved automatically (debounced while typing, or immediately
// once a field loses focus), so callers only need to supply the
// initial values and an onSave handler.
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

  // Solid doesn't auto-unmount ref callbacks the way React's new
  // ref-cleanup convention does, so the returned unmount function is
  // wired to onCleanup explicitly here.
  const mountEditor = (el: HTMLDivElement) => {
    const unmount = editor.mount(el);
    onCleanup(() => {
      if (typeof unmount === "function") unmount();
    });
  };

  // Set by AutoSave once it mounts, so a blur anywhere in this
  // component can flush the same debounced save AutoSave schedules on
  // every edit. AutoSave has to live inside <ProseKit> below (it reads
  // the editor's doc via useEditorDerivedValue), so a plain closure
  // variable is enough to share it -- nothing here needs to react to it.
  let flush: (() => void) | undefined;

  return (
    <ProseKit editor={editor}>
      {/* focusout bubbles (unlike blur), so this one listener covers
          both the title input and the editor body below: losing focus
          on either one flushes any pending autosave immediately. */}
      <div
        class="m-6 flex min-h-0 w-full flex-1 flex-col gap-4"
        onFocusOut={() => flush?.()}
      >
        <div class="flex flex-1 flex-col bg-field shadow-md">
          <input
            type="text"
            placeholder="Title"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            autofocus
            class="w-full bg-transparent px-3 pt-3 pb-2 text-2xl outline-none"
          />
          <div
            ref={mountEditor}
            class="ProseMirror flex-1 overflow-y-auto p-3 pb-10 text-text outline-none"
          />
        </div>

        <AutoSave
          initialTitle={initialTitle}
          title={title}
          onSave={props.onSave}
          registerFlush={(fn) => (flush = fn)}
        />
      </div>
    </ProseKit>
  );
}

interface AutoSaveProps {
  initialTitle: string;
  title: () => string;
  onSave: (data: { title: string; content: string }) => Promise<void>;
  registerFlush: (flush: () => void) => void;
}

// Watches the title (passed down as an accessor) and the editor's own
// doc, and saves whenever either one changes: debounced while the
// person keeps typing (see AUTOSAVE_DEBOUNCE_MS), or immediately once
// NoteEditor's onFocusOut calls the flush function registered below.
// A save is skipped entirely while the title is empty, which is what
// keeps a brand-new card from being created until it actually has a
// title -- once it does, every further edit (title or content) saves
// normally. Renders nothing; it only exists to run inside <ProseKit>,
// which useEditorDerivedValue requires.
function AutoSave(props: AutoSaveProps) {
  const docJSON = useEditorDerivedValue((editor) => editor.getDocJSON());

  let baselineTitle = props.initialTitle;
  let baselineContent = JSON.stringify(docJSON());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  // Whether another save is needed once the in-flight one finishes, so
  // edits made while saving aren't dropped.
  let pending = false;

  const isDirty = () =>
    props.title().trim() !== baselineTitle ||
    JSON.stringify(docJSON()) !== baselineContent;

  const save = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    const title = props.title().trim();
    if (!title || !isDirty()) return;
    if (saving) {
      pending = true;
      return;
    }
    saving = true;
    const content = docToLines(docJSON()).join("\n").trim();
    try {
      await props.onSave({ title, content });
      baselineTitle = title;
      baselineContent = JSON.stringify(docJSON());
    } catch (err) {
      console.error("[noteEditor] autosave failed:", err);
    } finally {
      saving = false;
      if (pending) {
        pending = false;
        save();
      }
    }
  };

  createEffect(() => {
    // Track both signals so any title or content edit reschedules the
    // debounce timer below.
    props.title();
    docJSON();
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
  });

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  props.registerFlush(save);

  return null;
}
