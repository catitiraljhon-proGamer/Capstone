"use client";

import { Button } from "@/components/ui/button";
import type { HouseDesign } from "@/lib/house-design-data";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

type DesignPagerProps = {
  designs: HouseDesign[];
  currentId: string;
  onSelect: (design: HouseDesign) => void;
};

/** Typing in a field keeps its arrow keys; they only switch designs elsewhere on the page. */
function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * Previous and Next buttons for the designs in the open house type, wrapping around at the ends.
 * The arrow keys do the same: left or up for the previous design, right or down for the next.
 */
export function DesignPager({ designs, currentId, onSelect }: DesignPagerProps) {
  const index = designs.findIndex((design) => design.id === currentId);
  const count = designs.length;
  const previous = count > 1 && index >= 0 ? designs[(index - 1 + count) % count] : null;
  const next = count > 1 && index >= 0 ? designs[(index + 1) % count] : null;

  useEffect(() => {
    if (!previous || !next) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      const target =
        event.key === "ArrowLeft" || event.key === "ArrowUp" ? previous
          : event.key === "ArrowRight" || event.key === "ArrowDown" ? next
            : null;
      if (!target) return;
      event.preventDefault();
      onSelect(target);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [previous, next, onSelect]);

  if (!previous || !next) return null;

  return (
    <nav aria-label="Browse designs" className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => onSelect(previous)} aria-label={`Previous design: ${previous.name}`}>
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
        Previous
      </Button>
      <span className="min-w-14 text-center text-sm tabular-nums text-stone-600" aria-live="polite">
        {index + 1} of {count}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => onSelect(next)} aria-label={`Next design: ${next.name}`}>
        Next
        <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}
