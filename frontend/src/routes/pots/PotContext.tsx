import { createContext, useContext, type Accessor } from "solid-js";
import type { PotRecord } from "./PotForm";

// Shares the pot record fetched once by PotLayout with every route
// nested under it (CardList, CardForm), so navigating between them
// never issues a second identical fetchPotBySlug request. Duplicate
// in-flight requests to the same PocketBase endpoint get
// auto-cancelled by the SDK, which is what broke navigation once
// CardList and CardForm each fetched the pot on their own.
const PotContext = createContext<Accessor<PotRecord | undefined>>(
  () => undefined,
);

export function usePot(): Accessor<PotRecord | undefined> {
  return useContext(PotContext);
}

export default PotContext;
