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
  <svg
    viewBox="0 0 495 495"
    fill="none"
    style={{ width: `${size()}px`, height: `${size()}px` }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill="#4A4A4A"
      d="M0 247.5V495h247.5V247.5H0zM145.508 398.049h-43.516v-40h43.516v40zM182.226 332.775H65.274v-40h116.951v40z"
    />
    <path
      fill="#2F2F2F"
      d="M247.5 495H495V247.5H247.5V495zM393.008 398.049h-43.516v-40h43.516v40zM323.654 292.775h106.071v40H323.654v-40z"
    />
    <path
      fill="#707070"
      d="M247.5 0H0v247.5h247.5V0zM145.508 150.549h-43.516v-40h43.516v40zM182.226 85.275H65.274v-40h116.951v40z"
    />
    <path
      fill="#4A4A4A"
      d="M247.5 0v247.5H495V0H247.5zM393.008 150.549h-43.516v-40h43.516v40zM429.726 85.275H312.774v-40h116.951v40z"
    />

    <rect x="312.774" y="45.275" fill="#FFFFFF" width="116.951" height="40" />
    <rect x="349.492" y="110.549" fill="#B5B5B5" width="43.516" height="40" />

    <rect x="65.274" y="45.275" fill="#FFFFFF" width="116.951" height="40" />
    <rect x="101.992" y="110.549" fill="#D0D0D0" width="43.516" height="40" />

    <rect x="323.654" y="292.775" fill="#FFFFFF" width="106.071" height="40" />
    <rect x="349.492" y="358.049" fill="#B5B5B5" width="43.516" height="40" />

    <rect x="65.274" y="292.775" fill="#FFFFFF" width="116.951" height="40" />
    <rect x="101.992" y="358.049" fill="#D0D0D0" width="43.516" height="40" />
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
