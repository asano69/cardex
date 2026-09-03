import { For, Show } from "solid-js";
import { A } from "@solidjs/router";

import { Cone as Focus, Notebook } from "../../lib/icons";

import { useVersion } from "../../lib/version";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Focus;
}

// Static top-level nav items, in the order they're shown. Kept as plain
// data so each entry is just a {href, label, icon} tuple instead of
// duplicating the same <A> markup per page.
const NAV_ITEMS: NavItem[] = [
  { href: "/focus", label: "Focus", icon: Focus },
  { href: "/diary", label: "Diary", icon: Notebook },
];

export interface SidebarProps {
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar(props: SidebarProps) {
  const version = useVersion();

  return (
    <>
      {/* Overlay only exists on mobile, where the sidebar floats above
          the page instead of sitting in the flex layout. Kept mounted
          while isMobile stays true so its opacity can transition
          in/out instead of popping in/out with the sidebar. */}
      <Show when={props.isMobile}>
        <div
          class="absolute inset-0 z-20 bg-black/40 transition-opacity duration-200"
          classList={{ "pointer-events-none opacity-0": !props.open }}
          onClick={() => props.onClose()}
        />
      </Show>

      {/* Always mounted (not conditionally rendered via <Show>) so the
          transform transition below actually animates open <-> closed
          instead of the element just appearing/disappearing. On mobile
          it's translated off-screen when closed; on desktop `open` is
          always true (see MainLayout), so it never moves. */}
      <aside
        aria-hidden={props.isMobile && !props.open}
        classList={{
          "absolute inset-y-0 left-0 z-30": props.isMobile,
          // Shadow only while actually visible: it's dropped entirely
          // once closed instead of just relying on -translate-x-full to
          // carry it off-screen, since the shadow's blur radius would
          // otherwise still bleed a few pixels into the viewport from
          // just past the left edge.
          "shadow-popover": props.isMobile && props.open,
          "-translate-x-full": props.isMobile && !props.open,
        }}
        class="flex h-full min-h-0 w-64 flex-col border-r border-border bg-bg transition-transform duration-200 ease-in-out"
      >
        <nav class="p-2 text-md">
          <For each={NAV_ITEMS}>
            {(item) => (
              <A
                href={item.href}
                end
                activeClass="bg-active-bg"
                class="flex items-center gap-2 rounded-md px-2 py-2.5 text-text transition-colors hover:bg-hover-bg"
              >
                <item.icon size={20} />
                {item.label}
              </A>
            )}
          </For>
        </nav>

        {/* mt-auto pins this to the bottom of the sidebar regardless of
            how tall the nav list above ends up being. */}
        <footer class="mt-auto p-2 text-border font-mono text-xs">
          <Show when={version()}>v{version()}</Show>
        </footer>
      </aside>
    </>
  );
}
