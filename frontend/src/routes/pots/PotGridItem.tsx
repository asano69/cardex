import { createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { useSortable } from "@dnd-kit/solid/sortable";
import { Pencil, Trash2 } from "../../lib/icons";
import ActionsMenu from "../../components/menus/ActionsMenu";
import PromptDialog from "../../components/dialogs/PromptDialog";
import ConfirmDialog from "../../components/dialogs/ConfirmDialog";
import pb from "../../lib/pb";
import type { PotRecord } from "./PotForm";

export interface PotGridItemProps {
  pot: PotRecord;
  // This pot's position in the currently rendered grid order. Fed to
  // useSortable below so dnd-kit can report initialIndex/index on drop
  // (see PotList.tsx's handleDragEnd). Mirrors CardItem's own `index`
  // prop.
  index: number;
  // Called with the updated record after a successful rename.
  onChanged: (record: PotRecord) => void;
  // Called with the (now-deleted) pot after a successful delete.
  onDeleted: (pot: PotRecord) => void;
}

// A single pot in PotList's grid, styled identically to CardItem's own
// card-grid-item -- but with no description (pots have no equivalent
// field) and no pin indicator. Clicking the card opens that pot's own
// card list; renaming and deleting -- which used to live inline on
// PotItem's row -- now live behind an ActionsMenu ("...") overlaid on
// the card, since there is no longer a separate "pot detail" page to
// host them on.
export default function PotGridItem(props: PotGridItemProps) {
  // Getter syntax (not a plain destructure) so the hook re-reads
  // id/index reactively instead of only once at setup -- see
  // dnd-kit's Solid docs (same as CardItem).
  const { ref, isDragging } = useSortable({
    get id() {
      return props.pot.id;
    },
    get index() {
      return props.index;
    },
  });

  const [renameOpen, setRenameOpen] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);

  const handleRename = async (title: string) => {
    const record = await pb
      .collection("pots")
      .update<PotRecord>(props.pot.id, { title });
    props.onChanged(record);
  };

  const handleDelete = async () => {
    await pb.collection("pots").delete(props.pot.id);
    props.onDeleted(props.pot);
  };

  return (
    <li
      ref={ref}
      class="card-grid-item"
      classList={{ "opacity-40": isDragging() }}
    >
      <A href={`/${props.pot.slug}`}>
        <div class="content">
          <div class="header">
            <h3 class="title">{props.pot.title}</h3>
          </div>
        </div>
      </A>
      {/* Sits as a sibling of the <a>, not inside it, so clicking it
          doesn't also trigger the link's navigation. Positioned over
          the top-right corner, matching where CardItem's pin
          indicator sits. */}
      <div class="absolute top-1 right-1 z-10">
        <ActionsMenu
          label="Pot actions"
          items={[
            {
              label: "Rename",
              icon: Pencil,
              onSelect: () => setRenameOpen(true),
            },
            {
              label: "Delete",
              icon: Trash2,
              onSelect: () => setDeleteOpen(true),
              destructive: true,
            },
          ]}
        />
      </div>

      <PromptDialog
        open={renameOpen()}
        onOpenChange={setRenameOpen}
        title="Rename pot"
        label="Title"
        initialValue={props.pot.title}
        onSubmit={handleRename}
        errorMessage="Failed to rename the pot."
      />
      {/* Deleting a pot cascade-deletes every card inside it (see the
          "pot" relation field's cascadeDelete option), so this is
          confirmed before it happens. */}
      <ConfirmDialog
        open={deleteOpen()}
        onOpenChange={setDeleteOpen}
        title="Delete pot"
        description="This will permanently delete this pot and all its cards."
        onConfirm={handleDelete}
        confirmLabel="Delete"
        submittingLabel="Deleting…"
        errorMessage="Failed to delete the pot."
      />
    </li>
  );
}
