import { createSignal, createEffect } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import { Combobox } from "@kobalte/core/combobox";
import { X, Check, ChevronDown } from "../../lib/icons";

export interface ComboboxDialogProps<T extends Record<string, unknown>> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  options: T[];
  optionValue: keyof T & string;
  optionLabel: keyof T & string;
  placeholder?: string;
  initialValue?: T | null;
  onSubmit: (option: T) => Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  errorMessage?: string;
}

export default function ComboboxDialog<T extends Record<string, unknown>>(
  props: ComboboxDialogProps<T>,
) {
  const [value, setValue] = createSignal<T | null>(null);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (props.open) {
      // Wrapped in a function form: T could in principle overlap with
      // Solid's "updater function" overload from the setter's point of
      // view, so passing the value directly trips its overload
      // resolution. The functional form (prev) => value sidesteps that.
      setValue(() => props.initialValue ?? null);
      setError("");
    }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) setError("");
    props.onOpenChange(open);
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const selected = value();
    if (!selected) return;
    setError("");
    setSubmitting(true);
    try {
      await props.onSubmit(selected);
      props.onOpenChange(false);
    } catch {
      setError(props.errorMessage ?? "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
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
              <div class="flex items-end gap-2">
                <Combobox<T>
                  options={props.options}
                  optionValue={props.optionValue}
                  optionLabel={props.optionLabel}
                  optionTextValue={props.optionLabel}
                  value={value()}
                  onChange={setValue}
                  placeholder={props.placeholder}
                  itemComponent={(itemProps) => (
                    <Combobox.Item
                      item={itemProps.item}
                      class="cursor-pointer rounded-sm px-2 py-1.5 text-sm text-text outline-none data-[highlighted]:bg-hover-bg"
                    >
                      <Combobox.ItemLabel>
                        {String(itemProps.item.rawValue[props.optionLabel])}
                      </Combobox.ItemLabel>
                    </Combobox.Item>
                  )}
                  class="flex flex-1 flex-col gap-1"
                >
                  <Combobox.Label class="text-sm text-text">
                    {props.label}
                  </Combobox.Label>
                  <Combobox.Control class="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2">
                    <Combobox.Input class="w-full bg-transparent text-sm text-text outline-none" />
                    <Combobox.Trigger class="text-border">
                      <Combobox.Icon>
                        <ChevronDown size={16} />
                      </Combobox.Icon>
                    </Combobox.Trigger>
                  </Combobox.Control>
                  <Combobox.Portal>
                    <Combobox.Content class="z-50 rounded-md border border-border bg-card p-1 shadow-popover">
                      <Combobox.Listbox class="max-h-60 overflow-y-auto" />
                    </Combobox.Content>
                  </Combobox.Portal>
                </Combobox>
                <button
                  type="submit"
                  aria-label={
                    submitting()
                      ? (props.submittingLabel ?? "Saving…")
                      : (props.submitLabel ?? "Save")
                  }
                  class="icon-btn shrink-0"
                  disabled={submitting() || !value()}
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
