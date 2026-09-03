export interface SaveButtonProps {
  saving: boolean;
  justSaved: boolean;
  // Whether there's something to save. Omitted means the button stays
  // enabled regardless of dirty-tracking, which is what forms without
  // a draft/dirty concept of their own want (e.g. Sleep's form).
  dirty?: boolean;
}

// Shared "Save"/"Saving…"/"Saved" submit button. Callers own what
// "dirty" means for their own form (or skip it entirely); this
// component only renders the three states.
export default function SaveButton(props: SaveButtonProps) {
  return (
    <div class="flex justify-end">
      {/* No .btn here: that class's border/bg-field styling doesn't
          fit a solid green call-to-action button, so this is styled
          directly instead. disabled:opacity-40 is what grays the
          button out while there's nothing to save. */}
      <button
        type="submit"
        class="my-1.5 cursor-pointer appearance-none rounded-md bg-[#28a745] px-4 py-2 font-sans text-base font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-[#23923d]"
        disabled={props.saving || props.dirty === false}
      >
        {props.saving ? "Saving…" : props.justSaved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
