import { Show } from "solid-js";
import { Menu, X } from "../../lib/icons";
import Logo from "../Logo";

import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";

export interface TopBarProps {
  isMobile: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

// The hamburger button here only toggles the Sidebar (owned by
// MainLayout, passed in as sidebarOpen/onToggleSidebar). There is no
// separate mobile-only menu anymore.
export default function TopBar(props: TopBarProps) {
  return (
    <header class="sticky top-0 z-40 p-2 border-b border-border bg-nav">
      <div class="flex justify-between px-2 md:px-8">
        <div class="flex items-center gap-3">
          {/* Toggle button only exists on mobile; on desktop the
              sidebar is always visible so there's nothing to toggle. */}
          <Show when={props.isMobile}>
            <button
              type="button"
              onClick={() => props.onToggleSidebar()}
              aria-label="Toggle sidebar"
              aria-expanded={props.sidebarOpen}
              class="icon-btn"
            >
              {props.sidebarOpen ? <X size={30} /> : <Menu size={30} />}
            </button>
          </Show>
          {/* Version hidden on mobile: there isn't room for it next to
              the hamburger toggle and title. */}
          <Logo showTitle linkable showVersion={!props.isMobile} />
        </div>

        <nav class="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}
