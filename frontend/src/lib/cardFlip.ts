// Smoothly animates a card's move within IssueDetail's CSS Grid using
// the FLIP technique (Invert + Play only -- "First"/"Last" are
// supplied by the caller via withCardsFlip below), since a card's
// on-screen position comes from plain DOM order in a CSS Grid, not
// from any top/left this module could set directly.
//
// Animating a plain `transform` instead of the card's real layout lets
// the browser run the animation on the compositor (GPU) without
// redoing Layout/Paint every frame -- same reasoning as
// moveAnimation.ts elsewhere in this app.
const MOVE_DURATION_MS = 500;
const MOVE_EASING = "cubic-bezier(0.25, 0, 0.2, 1)";

// Every currently-mounted card's root element, keyed by card id (see
// CardItem.tsx's registerCardElement call). Used by withCardsFlip to
// measure each card's on-screen position before and after a reorder.
const elements = new Map<string, HTMLElement>();

// Registers a card's element so withCardsFlip can animate it. Returns
// an unregister function, meant to be passed straight to onCleanup by
// the caller.
export function registerCardElement(id: string, el: HTMLElement): () => void {
  elements.set(id, el);
  return () => {
    // Only remove if this call still owns the slot -- guards against a
    // stale cleanup firing after a newer element has already
    // registered under the same id.
    if (elements.get(id) === el) elements.delete(id);
  };
}

function captureRects(): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  for (const [id, el] of elements) {
    rects.set(id, el.getBoundingClientRect());
  }
  return rects;
}

// Wraps a synchronous store mutation that may reorder the card grid
// (see cardsStore.ts), animating every card whose on-screen position
// changed as a result. Cards that didn't exist before the mutation --
// a brand-new card, or the very first render, when nothing is
// registered yet -- are left alone, since there's nothing to animate
// them from. Relies on Solid flushing DOM updates synchronously within
// `mutate()`, so the "after" rects below already reflect the new grid
// order by the time this function returns.
export function withCardsFlip(mutate: () => void): void {
  const before = captureRects();
  mutate();
  for (const [id, el] of elements) {
    const from = before.get(id);
    if (from) animateReorder(el, from);
  }
}

function animateReorder(el: HTMLElement, from: DOMRect): void {
  const to = el.getBoundingClientRect();
  const deltaX = from.left - to.left;
  const deltaY = from.top - to.top;
  if (deltaX === 0 && deltaY === 0) return; // didn't move -- nothing to animate

  el.style.transition = "";
  el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  el.style.willChange = "transform";
  // Force a reflow so the browser registers the inverted transform as
  // a real starting point before the transition below is applied.
  void el.offsetWidth;
  el.style.transition = `transform ${MOVE_DURATION_MS}ms ${MOVE_EASING}`;
  el.style.transform = "";
  window.setTimeout(() => {
    el.style.transition = "";
    el.style.willChange = "";
  }, MOVE_DURATION_MS);
}
