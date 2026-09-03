import { Show, type ParentProps } from "solid-js";
import { A } from "@solidjs/router";

import { useVersion } from "../lib/version";

export interface LogoProps {
  // Overall pixel size of the icon (width == height). Defaults to 30px.
  size?: number;
  // Whether to render "App Title" next to the icon.
  showTitle?: boolean;
  // Whether to show the running server version next to the title.
  showVersion?: boolean;
  // Whether clicking the logo navigates home ("/"). Defaults to false,
  // since Login renders pre-auth where there's nowhere to navigate to
  // yet -- it uses Logo without linkable and gets plain text/icon.
  linkable?: boolean;
  // If provided, the logo becomes a plain clickable button instead of
  // a link, and `linkable` is ignored.
  onClick?: () => void;
}

export default function Logo(props: LogoProps) {
  // Shared with Sidebar's footer (see lib/version.ts), so both display
  // the same value from one fetch implementation.
  const version = useVersion();

  const size = () => props.size ?? 30;
  // Scales with the icon: at the old default size (40px), this works
  // out to 24px, matching the previous fixed "text-2xl" class.
  const titleFontSize = () => size() * 0.6;

  const icon = (
    // stroke uses currentColor instead of a fixed hex, so the icon
    // follows whatever text color is in scope. Since body already sets
    // text-text (see base.css), and --color-text is defined with
    // light-dark() in theme.css, this adapts to light/dark mode with no
    // extra CSS needed here.
    <svg
      viewBox="0 0 16 16"
      fill="none"
      style={{ width: `${size()}px`, height: `${size()}px` }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14.72 4.57v0.07c0 1.5464 -1.2536 2.8 -2.8 2.8h-2.8v5.6h0.56c0.862175 0.0004375 1.4015125 -0.93261875 0.97080625 -1.67950625 -0.05950625 -0.1031875 -0.13509375 -0.19621875 -0.22390625 -0.27559375 -0.31169375 -0.2978 -0.18411875 -0.82134375 0.22963125 -0.942375 0.17941875 -0.05248125 0.37319375 -0.01198125 0.51656875 0.107975 1.28518125 1.14965 0.8438875 3.2594375 -0.79433125 3.79760625 -0.225525 0.0740875 -0.46139375 0.11185625 -0.69876875 0.11189375h-0.56v1.12c0 0.4310875 -0.46666875 0.70051875 -0.84 0.484975 -0.1732625 -0.1000375 -0.28 -0.28490625 -0.28 -0.484975v-1.12h-1.68c-0.4310875 0 -0.70051875 -0.46666875 -0.484975 -0.84 0.1000375 -0.1732625 0.28490625 -0.28 0.484975 -0.28H8v-5.6h-1.68c-0.862175 0.0000375 -1.40104375 0.93339375 -0.969925 1.68004375 0.200075 0.34650625 0.56980625 0.55995625 0.969925 0.55995625 0.4310875 0 0.70051875 0.46666875 0.484975 0.84 -0.1000375 0.1732625 -0.28490625 0.28 -0.484975 0.28 -1.72435 0 -2.802075 -1.86666875 -1.9399 -3.36 0.4001375 -0.69305625 1.139625 -1.12 1.9399 -1.12H8v-5.6c0 -0.4310875 0.46666875 -0.70051875 0.84 -0.484975 0.1732625 0.1000375 0.28 0.28490625 0.28 0.484975v5.6h2.8c0.92780625 -0.00004375 1.68 -0.75219375 1.68 -1.68v-0.07c0 -0.88918125 -0.72081875 -1.61 -1.61 -1.61H10.8c-0.4310875 0 -0.70051875 -0.46666875 -0.484975 -0.84 0.1000375 -0.1732625 0.28490625 -0.28 0.484975 -0.28h1.19c1.5077375 0 2.73 1.2222625 2.73 2.73ZM3.52 5.76H1.84c-0.30928125 0 -0.56 -0.25071875 -0.56 -0.56v-0.56c0 -1.5464 1.2536 -2.8 2.8 -2.8h2.24c0.4310875 0 0.70051875 0.46666875 0.484975 0.84 -0.1000375 0.1732625 -0.28490625 0.28 -0.484975 0.28 0 1.54635 -1.25365 2.79993125 -2.8 2.8Zm1.68 -2.8H4.08C3.15213125 2.95995625 2.4 3.71213125 2.4 4.64h1.12c0.92780625 -0.00004375 1.68 -0.75219375 1.68 -1.68Z"
        fill="currentColor"
      />
    </svg>
  );

  const title = () =>
    props.showTitle && (
      <div
        class="logo font-display"
        style={{ "font-size": `${titleFontSize()}px` }}
      >
        {__APP_NAME__}
      </div>
    );

  // Wraps `children` in whatever interactive element this instance
  // needs: a plain button when onClick is given (takes priority over
  // linkable), a home link with the original hover effects when
  // linkable, or a plain flex container otherwise (Login's case).
  const Wrap = (p: ParentProps) =>
    props.onClick ? (
      <button type="button" onClick={props.onClick} class="contents">
        {p.children}
      </button>
    ) : props.linkable ? (
      <A
        href="/"
        class="group flex items-center gap-2 transition-opacity hover:opacity-60 hover:scale-[1.02]"
      >
        {p.children}
      </A>
    ) : (
      <div class="flex items-center gap-2">{p.children}</div>
    );

  return (
    <div class="flex items-center gap-2">
      <Wrap>
        {icon}
        {title()}
      </Wrap>
      {/* Rendered outside Wrap so it's never part of the clickable
          logo (button/link). Only shown when showVersion is set (e.g.
          TopBar hides it on mobile to save space), not by default. */}
      <Show when={props.showVersion && version()}>
        <span class="font-mono text-xs">v{version()}</span>
      </Show>
    </div>
  );
}
