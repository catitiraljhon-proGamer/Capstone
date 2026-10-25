"use client";

import { cn } from "@/lib/utils";
import { Check, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";

export type SearchableSelectOption = { value: string; label: string };

type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Submits the value with the surrounding form, as a native select would. */
  name?: string;
  onBlur?: () => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Lowercase without accents, so "paranaque" finds "Parañaque". */
const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const startsAWord = (label: string, needle: string) => {
  for (let index = label.indexOf(needle); index !== -1; index = label.indexOf(needle, index + 1)) {
    if (index === 0 || !/[a-z0-9]/.test(label[index - 1])) return true;
  }
  return false;
};

/**
 * Options with a word that starts with the search, those whose name starts with it first, so typing "a" narrows
 * the list right away. Only when no word matches does it fall back to any part of the name, e.g. "12" for "PRJ-0012".
 */
function findMatches(options: SearchableSelectOption[], query: string) {
  const needle = normalize(query.trim());
  if (!needle) return [];
  const labels = options.map((option) => normalize(option.label));
  const byName = options.filter((_, index) => labels[index].startsWith(needle));
  const byWord = options.filter((_, index) => !labels[index].startsWith(needle) && startsAWord(labels[index], needle));
  if (byName.length || byWord.length) return [...byName, ...byWord];
  return options.filter((_, index) => labels[index].includes(needle));
}

/** Search bar that suggests matching options as the user types; only a picked option counts as a value. */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search",
  emptyMessage = "No matches found.",
  required,
  disabled,
  id,
  className,
  name,
  onBlur,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SearchableSelectProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // What the user typed since the last pick; null shows the picked option's name.
  const [query, setQuery] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => findMatches(options, query ?? ""), [options, query]);

  useEffect(() => {
    const message = required && !selected ? "Type to search, then pick from the list." : "";
    inputRef.current?.setCustomValidity(message);
    nativeRef.current?.setCustomValidity(message);
  }, [required, selected]);

  useEffect(() => {
    if (isOpen) listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex]);

  const commit = (next: string) => {
    // Like a native select, picking the current option again is not a change.
    if (next === value) return;
    if (!nativeRef.current) return onChange(next);
    // Apply the value first so form listeners read it from the native select.
    flushSync(() => onChange(next));
    nativeRef.current.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const pick = (option: SearchableSelectOption) => {
    setQuery(null);
    setIsOpen(false);
    commit(option.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!isOpen && !query?.trim()) return;
      event.preventDefault();
      if (!isOpen) return setIsOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (matches.length ? (index + step + matches.length) % matches.length : 0));
    } else if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      if (matches[activeIndex]) pick(matches[activeIndex]);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-stone-400" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        id={id}
        // With a name, the visible input carries it for blur listeners but stays out of the form's data and elements.
        name={name}
        form={name ? `${listId}-search` : undefined}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={query ?? selected?.label ?? ""}
        placeholder={placeholder}
        title={selected?.label}
        onChange={(event) => {
          // Typing only narrows the suggestions; the field's value changes when an option is picked.
          event.stopPropagation();
          const text = event.target.value;
          setQuery(text);
          setActiveIndex(0);
          setIsOpen(Boolean(text.trim()));
          // Emptying the search bar clears the value, so a cleared filter shows everything again.
          if (!text) commit("");
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (query !== null) {
            // Typing an option's full name counts as picking it.
            const exact = options.find((option) => normalize(option.label) === normalize(query.trim()));
            if (exact) commit(exact.value);
            setQuery(null);
          }
          setIsOpen(false);
          onBlur?.();
        }}
        className={cn(className, "pl-9")}
      />

      {isOpen ? (
        <ul ref={listRef} id={listId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-stone-200">
          {matches.length === 0 ? (
            <li className="px-3 py-2 font-normal text-stone-500">{emptyMessage}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  // Keeps a wrapping <label> from refocusing the input.
                  event.preventDefault();
                  pick(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 font-normal text-stone-950",
                  index === activeIndex && "bg-rose-50",
                )}
              >
                {option.label}
                {option.value === value ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-red-700" /> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {name ? (
        // The form's copy of the value: read by FormData, found by name in form.elements, and focus moves to the search input.
        <select
          ref={nativeRef}
          name={name}
          value={value}
          onChange={() => undefined}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          onFocus={() => inputRef.current?.focus()}
          className="sr-only"
        >
          <option value="" />
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : null}
    </div>
  );
}
