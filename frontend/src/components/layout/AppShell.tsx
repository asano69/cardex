import type { ParentProps } from "solid-js";
import MainLayout from "./MainLayout";

// Wraps every route so Header and Sidebar render once regardless of page.
// Passed as Router's `root` prop (see lib/router.tsx) instead of wrapping
// <Router> from outside, since anything AppShell renders needs to live
// inside the router context (e.g. Logo's <A> links).
export default function AppShell(props: ParentProps) {
  return <MainLayout>{props.children}</MainLayout>;
}
