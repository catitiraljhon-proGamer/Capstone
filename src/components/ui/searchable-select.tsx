"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";
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

/** Text input that filters a list of options by label; only a picked option counts as a value. */
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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  useEffect(() => {
    const message = required && !selected ? "Select an option from the list." : "";
    inputRef.current?.setCustomValidity(message);
    nativeRef.current?.setCustomValidity(message);
  }, [required, selected]);

  useEffect(() => {
    if (isOpen) listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex]);

  const open = () => {
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    setIsOpen(true);
  };

  const pick = (option: SearchableSelectOption) => {
    setIsOpen(false);
    // Like a native select, picking the current option again is not a change.
    if (option.value === value) return;
    if (!nativeRef.current) return onChange(option.value);
    // Apply the pick first so form listeners read the new value from the native select.
    flushSync(() => onChange(option.value));
    nativeRef.current.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) return open();
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
        type="text"
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
        value={isOpen ? query : (selected?.label ?? "")}
        placeholder={selected?.label ?? placeholder}
        title={selected?.label}
        onFocus={open}
        onClick={() => !isOpen && open()}
        onChange={(event) => {
          // Typing only narrows the list; the field's value changes when an option is picked.
          event.stopPropagation();
          setQuery(event.target.value);
          setActiveIndex(0);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setIsOpen(false);
          onBlur?.();
        }}
        className={cn(className, "pl-9 pr-9", isOpen && selected && "placeholder:text-stone-950")}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 text-stone-500" />

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
                  // Keeps a wrapping <label> from re-opening the list by clicking the input.
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
