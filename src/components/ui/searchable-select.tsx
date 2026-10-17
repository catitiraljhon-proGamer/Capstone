"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

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
}: SearchableSelectProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selected ? "Select an option from the list." : "");
  }, [required, selected]);

  const open = () => {
    setQuery("");
    setActiveIndex(0);
    setIsOpen(true);
  };

  const pick = (option: SearchableSelectOption) => {
    onChange(option.value);
    setIsOpen(false);
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
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={isOpen ? query : (selected?.label ?? "")}
        placeholder={selected?.label ?? placeholder}
        onFocus={open}
        onClick={() => !isOpen && open()}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setIsOpen(false)}
        className={cn(className, "pl-9 pr-9", isOpen && selected && "placeholder:text-stone-950")}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 text-stone-500" />

      {isOpen ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-stone-200">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-stone-500">{emptyMessage}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 font-normal text-stone-950",
                  index === activeIndex && "bg-rose-50",
                )}
              >
                {option.label}
                {option.value === value ? <Check aria-hidden="true" className="h-4 w-4 text-red-700" /> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
