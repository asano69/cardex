import { For } from "solid-js";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Ellipsis } from "../../lib/icons";

export interface ActionsMenuItem {
  label: string;
  icon: typeof Ellipsis;
  onSelect: () => void;
  destructive?: boolean;
}

export interface ActionsMenuProps {
  // aria-label for the trigger button (defaults to "Actions")
  label?: string;
  items: ActionsMenuItem[];
}

// Reusable "..." dropdown menu: an icon-button trigger plus a list of
// action items. Several pages need a small overflow menu (context list
// actions, note actions, ...); this keeps the DropdownMenu markup and
// styling in one place instead of duplicating it per page.
export default function ActionsMenu(props: ActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        aria-label={props.label ?? "Actions"}
        class="icon-btn"
      >
        <Ellipsis size={24} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="z-50 min-w-[160px] rounded-md border border-border bg-card p-1 shadow-popover outline-none font-sans">
          <For each={props.items}>
            {(item) => (
              <DropdownMenu.Item
                onSelect={item.onSelect}
                class={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-hover-bg data-[highlighted]:bg-hover-bg ${
                  item.destructive ? "text-[#dc3545]" : "text-text"
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </DropdownMenu.Item>
            )}
          </For>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
}
