import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { Menu, CirclePlus, X } from "../../lib/icons";
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
      <div class="grid w-full grid-cols-[1fr_auto_1fr] items-center px-2 md:px-8">
        <div class="flex items-center gap-3 justify-self-start">
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
          {/* Current pot's name, when the active page registered one
              (see CardList/CardForm's useTopBarPotLink call). Links
              back to that pot's card list. */}
          <Show when={topBarPotLink()}>
            <A
              href={`/${topBarPotLink()!.slug}`}
              class="truncate font-sans text-md font-bold hover:bg-hover-bg"
            >
              {topBarPotLink()!.name}
            </A>
          </Show>
        </div>

        {/* Center slot: "add card" is shared between CardList and
            CardForm (both register a pot link via useTopBarPotLink),
            so it lives here instead of being duplicated as a per-page
            button. Only shown while a pot is in context -- there's
            nothing to add a card to from the pots list itself. */}
        <div class="flex items-center justify-self-center">
          <Show when={topBarPotLink()}>
            <A
              href={`/${topBarPotLink()!.slug}/new`}
              class="icon-btn"
              aria-label="Add card"
            >
              <CirclePlus size={26} />
            </A>
          </Show>
        </div>

        <nav class="flex items-center gap-1 justify-self-end">
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
