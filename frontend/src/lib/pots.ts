import pb from "./pb";
import type { PotRecord } from "../routes/pots/PotForm";

// Looks up an pot by its unique "slug" field. Pots are addressed by
// slug in the URL instead of their PocketBase id, so any page that
// needs the parent pot for a "/:slug/..." route resolves it here
// rather than duplicating the same filtered lookup.
export async function fetchPotBySlug(slug: string): Promise<PotRecord> {
  return await pb
    .collection("pots")
    .getFirstListItem<PotRecord>(pb.filter("slug = {:slug}", { slug }));
}
