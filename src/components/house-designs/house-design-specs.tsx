import type { HouseDesign } from "@/lib/house-design-data";

type HouseDesignSpecsProps = {
  design: Pick<HouseDesign, "houseType" | "bedrooms" | "bathrooms">;
  className?: string;
};

/** House type and room counts on a design's detail page, the same for Admin and customers. */
export function HouseDesignSpecs({ design, className = "" }: HouseDesignSpecsProps) {
  const specs = [
    { label: "House Type", value: design.houseType ?? "Not assigned" },
    { label: "Bedrooms", value: design.bedrooms },
    { label: "Bathrooms", value: design.bathrooms },
  ];

  return (
    <dl className={`grid gap-3 text-sm sm:grid-cols-3 ${className}`}>
      {specs.map((spec) => (
        <div key={spec.label} className="rounded-lg border border-stone-200 p-4">
          <dt className="text-xs font-semibold uppercase text-stone-500">{spec.label}</dt>
          <dd className="mt-1 font-semibold tabular-nums text-stone-950">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}
