package main

// backfill_card_slugs
// ---
// go run ./scripts/backfill_card_slugs --dir=pb_data
// ---
//
// One-off backfill: computes each "cards" record's "slug" field from
// its existing "title" via internal/slug.FromTitle -- the exact same
// function the server uses at save time (see
// internal/serve/cards.go) -- so the backfilled values are guaranteed
// consistent with what the server would have written itself.
//
// Run this BEFORE creating the (pot, slug) unique index in the
// PocketBase admin UI, since existing data may currently contain the
// slug collisions that index is meant to prevent (two different
// titles, e.g. "a b" and "a_b", normalizing to the same slug "a_b").
// This script does NOT resolve such collisions automatically -- it
// only reports them -- because deciding which of two already-live
// cards should keep the unslashed slug and which should be renamed is
// a judgment call, not something safe to automate. If any collisions
// are printed, rename the affected cards' titles by hand (so their
// slugs differ) and re-run this script before adding the index.
//
// Safe to re-run: a record whose slug already matches
// slug.FromTitle(title) is left untouched, so a second run is a no-op
// except for any records touched by your manual fixes.
//
// IMPORTANT: stop the cardpot server before running this, so nothing
// else is writing to the same data directory at the same time.

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/pocketbase/pocketbase/core"

	"github.com/asano69/cardpot/internal/slug"
)

func main() {
	dir := flag.String("dir", envOr("CARDPOT_DATA_DIR", "pb_data"), "PocketBase data directory")
	flag.Parse()

	app := core.NewBaseApp(core.BaseAppConfig{DataDir: *dir})
	if err := app.Bootstrap(); err != nil {
		log.Fatalf("bootstrap app: %v", err)
	}
	defer func() { _ = app.ResetBootstrapState() }()

	records, err := app.FindRecordsByFilter("cards", "", "", 0, 0, nil)
	if err != nil {
		log.Fatalf("list cards: %v", err)
	}
	fmt.Printf("%d card(s) to check\n", len(records))

	// Tracks every (pot, slug) pair already assigned in this run, so a
	// collision between two existing records is caught and reported
	// instead of one silently overwriting the other's uniqueness once
	// the DB index is added later.
	seen := make(map[string]string) // "pot/slug" -> card id

	updated := 0
	collisions := 0
	for _, record := range records {
		pot := record.GetString("pot")
		title := record.GetString("title")
		computed := slug.FromTitle(title)
		key := pot + "/" + computed

		if existing, ok := seen[key]; ok {
			collisions++
			fmt.Printf("  [COLLISION] pot=%s slug=%q: card %s (title %q) and card %s already share this slug -- rename one of them before adding the unique index\n",
				pot, computed, existing, title, record.Id)
		} else {
			seen[key] = record.Id
		}

		if record.GetString("slug") == computed {
			continue // already correct -- no-op write avoided
		}
		record.Set("slug", computed)
		if err := app.Save(record); err != nil {
			log.Fatalf("save card %s: %v", record.Id, err)
		}
		updated++
		fmt.Printf("  [ok] %s: slug -> %q\n", record.Id, computed)
	}

	fmt.Printf("done: %d/%d updated, %d collision(s) found\n", updated, len(records), collisions)
	if collisions > 0 {
		fmt.Println("Resolve the collisions above (edit the affected cards' titles) and re-run before creating the (pot, slug) unique index.")
		os.Exit(1)
	}
}

func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
