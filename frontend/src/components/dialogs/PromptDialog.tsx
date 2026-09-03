import { createSignal, createEffect } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import { TextField } from "@kobalte/core/text-field";
import { X, Check } from "../../lib/icons";

export interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue?: string;
  onSubmit: (value: string) => Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  errorMessage?: string;
}

// Reusable single-field "edit" dialog: a label, a text field, and an
// inline checkmark button to save (mirrors ComboboxDialog's layout, no
// separate Cancel/Save text buttons -- closing via the header's X
// button is the cancel path). Fully controlled via
// `open`/`onOpenChange` so it can be opened from anywhere (e.g. a
// dropdown menu item) instead of needing its own Dialog.Trigger next to
// it.
export default function PromptDialog(props: PromptDialogProps) {
  const [value, setValue] = createSignal(props.initialValue ?? "");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");

  // This component stays mounted across opens/closes (only its Dialog
  // content mounts/unmounts internally), so the field has to be reset
  // to the current initialValue explicitly every time it opens.
  createEffect(() => {
    if (props.open) {
      setValue(props.initialValue ?? "");
      setError("");
    }
  });

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await props.onSubmit(value());
      props.onOpenChange(false);
    } catch {
      setError(props.errorMessage ?? "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Dialog.Content class="w-full max-w-sm rounded-md border border-border bg-card p-6 shadow-popover">
            <div class="mb-4 flex items-center justify-between">
              <Dialog.Title class="text-lg font-sans">
                {props.title}
              </Dialog.Title>
              <Dialog.CloseButton
                aria-label="Close"
                class="rounded-md p-1 text-text transition-colors hover:bg-hover-bg"
              >
                <X size={18} />
              </Dialog.CloseButton>
            </div>
            <form onSubmit={handleSubmit} class="flex flex-col gap-4">
              {/* Field and its inline save button share one row, same
                  pattern as ComboboxDialog: no separate full-width
                  Cancel/Save row anymore. */}
              <div class="flex items-end gap-2">
                <TextField
                  value={value()}
                  onChange={setValue}
                  class="flex min-w-0 flex-1 flex-col gap-1"
                >
                  <TextField.Label class="text-sm text-text">
                    {props.label}
                  </TextField.Label>
                  <TextField.Input
                    autofocus
                    class="w-full rounded-md border border-border bg-bg px-3 py-2 text-text"
                  />
                </TextField>
                <button
                  type="submit"
                  aria-label={
                    submitting()
                      ? (props.submittingLabel ?? "Saving…")
                      : (props.submitLabel ?? "Save")
                  }
                  class="icon-btn shrink-0"
                  disabled={submitting()}
                >
                  <Check size={20} />
                </button>
              </div>
              {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}
