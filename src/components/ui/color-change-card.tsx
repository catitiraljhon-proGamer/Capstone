"use client";

import { ArrowRight } from "lucide-react";
import type { HouseType } from "@/components/ui/house-design-data";

export default function ColorChangeCards({
  houseTypes,
  onSelect,
}: {
  houseTypes: HouseType[];
  onSelect?: (houseType: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4">
      {houseTypes.map((houseType) => (
        <Card
          key={houseType.heading}
          {...houseType}
          onSelect={() => onSelect?.(houseType.heading)}
        />
      ))}
    </div>
  );
}

function Card({
  heading,
  description,
  imgSrc,
  onSelect,
}: HouseType & {
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex min-h-72 min-w-0 w-full cursor-pointer overflow-hidden rounded-xl bg-stone-300 text-left ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-red-600 xl:min-h-[420px]"
      aria-label={`Choose ${heading} house type`}
    >
      <div
        className="absolute inset-0 saturate-100 transition-all duration-500 group-hover:scale-110 group-focus-visible:scale-110 md:saturate-75 md:group-hover:saturate-100 md:group-focus-visible:saturate-100"
        style={{
          backgroundImage: `url(${imgSrc})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/20 to-transparent" />
      <div className="relative z-20 flex min-w-0 flex-1 flex-col justify-between gap-8 p-4 text-white">
        <ArrowRight aria-hidden="true" className="ml-auto h-7 w-7 shrink-0 transition-transform duration-500 group-hover:-rotate-45 group-focus-visible:-rotate-45" />
        <div className="min-w-0">
          <h3 className="break-normal text-2xl leading-tight font-semibold tracking-tight">{heading}</h3>
          <p className="mt-3 text-sm leading-5 text-white/85">{description}</p>
        </div>
      </div>
    </button>
  );
}
