"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS, type Category } from "@/lib/listing";

type Hint = { count: number; low: number; high: number } | null;

/**
 * What comparable items charge, shown next to the price field.
 *
 * Taken straight from the Compare to similar listings idea in UI-REFERENCE.md section 4:
 * show the owner what other people charge and let them draw their own conclusion. No
 * advice, no persuasion, and above all no language model guessing a number, which
 * CLAUDE.md section 9 warns produces confident nonsense.
 */
export function PriceHint({ category }: { category: Category | null }) {
  // The category is stored next to its own numbers. Without that pairing, switching
  // category leaves the previous one's prices on screen until the new request lands,
  // which means showing money figures for the wrong kind of item.
  const [loaded, setLoaded] = useState<{ category: Category; hint: Hint } | null>(null);

  useEffect(() => {
    if (!category) return;
    let active = true;

    fetch(`/api/price-hint?category=${category}`)
      .then((response) => (response.ok ? response.json() : { hint: null }))
      .then((result) => {
        if (active) setLoaded({ category, hint: result.hint ?? null });
      })
      .catch(() => {
        // A missing hint is not worth an error message. The field works without it.
        if (active) setLoaded({ category, hint: null });
      });

    return () => {
      active = false;
    };
  }, [category]);

  const hint = category && loaded?.category === category ? loaded.hint : null;
  if (!category || !hint) return null;

  const label = CATEGORY_LABELS[category].toLowerCase();
  return (
    <p className="text-xs text-ink-muted">
      <span className="tabular">{hint.count}</span> {label} listings rent for{" "}
      <span className="tabular">{hint.low.toFixed(2)}</span> to{" "}
      <span className="tabular">{hint.high.toFixed(2)}</span> USDC per day.
    </p>
  );
}
