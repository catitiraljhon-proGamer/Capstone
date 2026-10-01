import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type PesoInputProps = Omit<ComponentProps<"input">, "type"> & {
  wrapperClassName?: string;
};

export function PesoInput({
  className,
  wrapperClassName,
  ...props
}: PesoInputProps) {
  return (
    <span className={cn("relative block", wrapperClassName)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-stone-500"
      >
        ₱
      </span>
      <input
        {...props}
        type="number"
        inputMode={props.inputMode ?? "decimal"}
        className={cn(
          "w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-8 pr-3 text-sm tabular-nums text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 disabled:bg-stone-100 aria-invalid:border-red-600",
          className,
        )}
      />
    </span>
  );
}
