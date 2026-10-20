import type { KeyboardEvent, MouseEvent } from "react";

export const clickableRowClass =
  "cursor-pointer outline-none transition hover:bg-stone-50 focus-visible:bg-rose-50";

/** Clicks on links, buttons, and checkboxes inside the row keep their own behavior. */
function startedOnControl(event: MouseEvent<HTMLElement>) {
  const control = (event.target as HTMLElement).closest("a, button, input, select, textarea, label");
  return control !== null && event.currentTarget.contains(control);
}

/** Makes a whole table row open its record on click, Enter, or Space. */
export function clickableRowProps(label: string, onOpen: () => void) {
  return {
    tabIndex: 0,
    "aria-label": label,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (!startedOnControl(event)) onOpen();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen();
      }
    },
  };
}
