"use client";

import { ArrowRight, CircleCheck } from "lucide-react";
import type { HouseType } from "@/lib/house-design-data";

/** One row of all seven house types on wide screens; fewer columns as space runs out. */
export const houseTypeGridClass =
  "grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7";

/** Narrower grid for choosing a house type inside a form. */
export const compactHouseTypeGridClass =
  "grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";

export default function HouseTypeCards({
  houseTypes,
  onSelect,
  selected,
  compact = false,
}: {
  houseTypes: HouseType[];
  onSelect?: (houseType: string) => void;
  /** When set, the cards act as a choice and the matching card is marked as chosen. */
  selected?: string | null;
  compact?: boolean;
}) {
  return (
    <div className={compact ? compactHouseTypeGridClass : houseTypeGridClass}>
      {houseTypes.map((houseType) => (
        <HouseTypeCard
          key={houseType.heading}
          {...houseType}
          ariaLabel={`Choose ${houseType.heading} house type`}
          compact={compact}
          selected={selected === undefined ? undefined : selected === houseType.heading}
          onSelect={() => onSelect?.(houseType.heading)}
        />
      ))}
    </div>
  );
}

export function HouseTypeCard({
  heading,
  description,
  imgSrc,
  ariaLabel,
  onSelect,
  selected,
  compact = false,
}: HouseType & {
  ariaLabel: string;
  onSelect: () => void;
  /** Marks the card as a choice (aria-pressed); undefined for plain navigation cards. */
  selected?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex min-w-0 w-full cursor-pointer overflow-hidden rounded-xl bg-stone-300 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${compact ? "min-h-60" : "min-h-72 xl:min-h-[420px]"} ${selected ? "ring-4 ring-red-700" : "ring-1 ring-stone-200"}`}
      aria-label={ariaLabel}
      aria-pressed={selected}
    >
      {imgSrc ? (
        <div
          className="absolute inset-0 saturate-100 transition-all duration-500 group-hover:scale-110 group-focus-visible:scale-110 md:saturate-75 md:group-hover:saturate-100 md:group-focus-visible:saturate-100"
          style={{
            backgroundImage: `url(${JSON.stringify(imgSrc)})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-red-950 to-red-800" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/20 to-transparent" />
      <div className="relative z-20 flex min-w-0 flex-1 flex-col justify-between gap-8 p-4 text-white">
        {selected ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-red-700 px-2 py-1 text-xs font-semibold">
            <CircleCheck aria-hidden="true" className="h-4 w-4" />
            Selected
          </span>
        ) : (
          <ArrowRight aria-hidden="true" className="ml-auto h-7 w-7 shrink-0 transition-transform duration-500 group-hover:-rotate-45 group-focus-visible:-rotate-45" />
        )}
        <div className="min-w-0">
          <h3 className={`break-normal leading-tight font-semibold tracking-tight ${compact ? "text-xl" : "text-2xl 2xl:text-lg"}`}>{heading}</h3>
          <p className={`mt-3 leading-5 text-white/85 ${compact ? "text-xs" : "text-sm"}`}>{description}</p>
        </div>
      </div>
    </button>
  );
}
