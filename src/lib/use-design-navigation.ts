"use client";

import type { HouseDesign } from "@/lib/house-design-data";
import { useEffect } from "react";

/** Typing in a field keeps its arrow keys; they only switch designs elsewhere on the page. */
function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * The designs before and after the open one in its house type, wrapping around at the ends.
 * The arrow keys switch designs: left or up for the previous design, right or down for the next.
 */
export function useDesignNavigation(
  designs: HouseDesign[],
  currentId: string,
  onSelect: (design: HouseDesign) => void,
) {
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

  return {
    position: index >= 0 && count > 1 ? `${index + 1} of ${count}` : null,
    onPrevious: previous ? () => onSelect(previous) : undefined,
    onNext: next ? () => onSelect(next) : undefined,
    previousName: previous?.name,
    nextName: next?.name,
  };
}
