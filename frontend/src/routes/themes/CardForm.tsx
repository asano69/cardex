import { createResource, createSignal, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import type { createEditor } from "prosekit/core";

import pb from "../../lib/pb";
import TextEditor from "../../components/editor/TextEditor";
import Loading from "../../components/Loading";

// Matches the PocketBase "cards" collection schema.
export interface CardRecord {
  id: string;
  title: string;
  content: string;
  theme: string;
  created: string;
  updated: string;
}

async function fetchCard(id: string): Promise<CardRecord> {
  return await pb.collection("cards").getOne<CardRecord>(id);
}

// Builds a ProseKit doc where each line becomes its own paragraph, so
// the editor's first line naturally maps to the card's title (see
// docToLines below for the inverse split used on save). At least one
// paragraph is always included, since ProseKit's basic schema requires
// a non-empty doc.
function linesToDocJSON(lines: string[]) {
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
// string per top-level block. Used on save to split the first line off
// as the title and join the rest back into the content field.
function docToLines(doc: any): string[] {
  const nodes: any[] = doc?.content ?? [];
  return nodes.map(textOf);
}

function textOf(node: any): string {
  if (node.type === "text") return node.text ?? "";
  const children: any[] = node.content ?? [];
  return children.map(textOf).join("");
}

// Add/edit page for a single card, reached from ThemeDetail's "add card"
// button (create, at /themes/:id/cards/new) or by clicking a card
// (edit, at /themes/:id/cards/:cardId). Both modes share the same form
// below; params.cardId being present is what selects edit mode.
export default function CardForm() {
  const params = useParams();
  const [existing] = createResource(() => params.cardId, fetchCard);

  return (
    <Show when={!params.cardId || !existing.loading} fallback={<Loading />}>
      <CardFields
        themeId={params.id}
        cardId={params.cardId}
        card={existing()}
      />
    </Show>
  );
}

interface CardFieldsProps {
  themeId: string;
  cardId?: string;
  card?: CardRecord;
}

// Split out from CardForm so a fresh editor is created once the
// existing card (if any) has finished loading -- the same pattern Diary
// uses for its own form (see routes/diary/index.tsx's DiaryForm).
function CardFields(props: CardFieldsProps) {
  const navigate = useNavigate();

  // Read once: CardFields is remounted fresh whenever the loaded card
  // changes (see CardForm's <Show>), so this never needs to react to
  // props.card updating.
  // eslint-disable-next-line solid/reactivity
  const [title, setTitle] = createSignal(props.card?.title ?? "");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  // Body only now: title is its own plain input above the editor (see
  // the <input> below), not the doc's first paragraph.
  // eslint-disable-next-line solid/reactivity
  const initialContent = linesToDocJSON(
    props.card?.content ? props.card.content.split("\n") : [],
  );

  // Set by TextEditor's onReady once its ProseKit editor is created, so
  // handleSave can read the current content via editor.getDocJSON().
  let editor: ReturnType<typeof createEditor>;

  const handleSave = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title().trim()) return;
    setError("");
    setSaving(true);
    try {
      const data = {
        title: title().trim(),
        content: docToLines(editor.getDocJSON()).join("\n").trim(),
        theme: props.themeId,
      };
      if (props.cardId) {
        await pb.collection("cards").update<CardRecord>(props.cardId, data);
      } else {
        await pb.collection("cards").create<CardRecord>(data);
      }
      navigate(`/themes/${props.themeId}`);
    } catch {
      setError(
        props.cardId ? "Failed to update the card." : "Failed to add the card.",
      );
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      class="flex min-h-0 flex-1 w-full flex-col gap-4 mb-20"
    >
      <TextEditor
        // Rendered inside TextEditor's own bordered box (see the
        // "header" prop) so the title and body read as one sheet of
        // paper instead of two separately-bordered elements.
        header={
          <input
            type="text"
            placeholder="Title"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            required
            autofocus
            class="w-full bg-transparent px-3 pt-3 pb-2 text-2xl font-bold text-text outline-none"
          />
        }
        initialContent={initialContent}
        saving={saving()}
        justSaved={false}
        onReady={(readyEditor) => (editor = readyEditor)}
      />

      {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}
    </form>
  );
}
