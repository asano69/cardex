import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { Menu, X } from "../../lib/icons";
import Logo from "../Logo";

import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";
import { topBarActions, topBarPotLink } from "../../lib/topBarSlot";

export interface TopBarProps {
  isMobile: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  // Extra classes for the outer <header>, so callers can control the
  // bar's height/padding (e.g. "h-10 py-0") without editing this
  // component. Falls back to the original spacing when omitted.
  class?: string;
}

// The hamburger button here only toggles the Sidebar (owned by
// MainLayout, passed in as sidebarOpen/onToggleSidebar). There is no
// separate mobile-only menu anymore.
export default function TopBar(props: TopBarProps) {
  return (
    <header
      class={`sticky top-0 z-40 flex items-center border-b border-border bg-nav ${props.class}`}
    >
      <div class="flex w-full justify-between px-2 md:px-8">
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
              {props.sidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </Show>
          {/* Version hidden on mobile: there isn't room for it next to
              the hamburger toggle and title. */}
          <Logo linkable showVersion={!props.isMobile} />
          {/* Themes is the app's only top-level nav item now that
              Sidebar holds just Diary, so it lives here next to the
              logo instead of behind the sidebar toggle. `end` limits
              the active state to the list itself: pot/card pages
              now live at "/:id" and "/:id/...", not nested under "/"
              in a way the router would otherwise treat as a match. */}
     
          {/* Current pot's name, when the active page registered one
              (see CardList/CardForm's useTopBarPotLink call). Links
              back to that pot's card list. */}
          <Show when={topBarPotLink()}>
            <A
              href={`/${topBarPotLink()!.slug}`}
              class="truncate font-sans text-sm hover:underline"
            >
              {topBarPotLink()!.name}
            </A>
          </Show>
        </div>

        <nav class="flex items-center gap-1">
          {/* Per-page actions slot (see lib/topBarSlot.ts): renders
              whatever the currently mounted page registered via
              useTopBarActions, e.g. CardForm's pin/delete buttons.
              Empty on pages that register nothing. */}
          {topBarActions()}
          <ThemeToggle />
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}
