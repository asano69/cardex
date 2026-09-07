import pb from "./pb";
import type { IssueRecord } from "../routes/issues/IssueForm";

// Looks up an issue by its unique "slug" field. Issues are addressed by
// slug in the URL instead of their PocketBase id, so any page that
// needs the parent issue for a "/:slug/..." route resolves it here
// rather than duplicating the same filtered lookup.
export async function fetchIssueBySlug(slug: string): Promise<IssueRecord> {
  return await pb
    .collection("issues")
    .getFirstListItem<IssueRecord>(pb.filter("slug = {:slug}", { slug }));
}
