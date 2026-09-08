// frontend/src/components/layout/UserMenu.tsx
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import {
  EllipsisVertical,
  LogOut,
  Settings,
  Help,
  About,
} from "../../lib/icons";
import pb from "../../lib/pb";

// Dropdown menu in the top-right corner, currently holding just logout.
// Split out of TopBar so TopBar stays focused on layout (toggle + logo)
// and this file can grow its own menu items without bloating TopBar.
export default function UserMenu() {
  const handleLogout = () => {
    pb.authStore.clear();
  };

  // Placeholder only -- no settings screen exists yet, so this item
  // does nothing when selected. Wire this up once a real settings
  // page/dialog is built.
  const handleSettings = () => {};

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger aria-label="Open menu" class="icon-btn">
        <EllipsisVertical size={24} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="z-50 min-w-[160px] rounded-md border border-border bg-card p-1 shadow-popover outline-none font-sans">
          <DropdownMenu.Item
            onSelect={handleSettings}
            class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text outline-none transition-colors hover:bg-hover-bg data-[highlighted]:bg-hover-bg"
          >
            <Settings size={16} />
            User Settings
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={handleSettings}
            class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text outline-none transition-colors hover:bg-hover-bg data-[highlighted]:bg-hover-bg"
          >
            <About size={16} />
            About Cardex
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={handleSettings}
            class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text outline-none transition-colors hover:bg-hover-bg data-[highlighted]:bg-hover-bg"
          >
            <Help size={16} />
            Help
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={handleLogout}
            class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text outline-none transition-colors hover:bg-hover-bg data-[highlighted]:bg-hover-bg"
          >
            <LogOut size={16} />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
}
