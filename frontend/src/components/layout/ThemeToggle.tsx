import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Sun, Moon, SunMoon, Check } from "../../lib/icons";
import { currentTheme, setTheme, type Theme } from "../../lib/theme";

interface ThemeOption {
  value: Theme;
  label: string;
  icon: typeof Sun;
}

// Options in the order they're listed in the menu. Each pairs a theme
// value with the icon shown both in the trigger (when active) and next
// to its own menu item, so there's a single source of truth for the
// icon/label/value mapping.
const OPTIONS: ThemeOption[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: SunMoon },
];

// Dropdown menu that switches between light/dark/system, styled and
// structured like UserMenu. The trigger icon always reflects the
// current setting, so the button doubles as a status indicator.
export default function ThemeToggle() {
  const activeOption = () =>
    OPTIONS.find((o) => o.value === currentTheme()) ?? OPTIONS[2];

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger aria-label="Change theme" class="icon-btn">
        <Dynamic component={activeOption().icon} size={24} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="z-50 min-w-[160px] rounded-md border border-border bg-card p-1 shadow-popover outline-none font-sans">
          <For each={OPTIONS}>
            {(option) => (
              <DropdownMenu.Item
                onSelect={() => setTheme(option.value)}
                class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text outline-none transition-colors hover:bg-hover-bg data-[highlighted]:bg-hover-bg"
              >
                <option.icon size={16} />
                <span class="flex-1">{option.label}</span>
                <Show when={currentTheme() === option.value}>
                  <Check size={16} />
                </Show>
              </DropdownMenu.Item>
            )}
          </For>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
}
