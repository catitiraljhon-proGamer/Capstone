/**
 * Repeating diagonal "G4 Builders Inc" mark laid over a design image. It is
 * part of the page, so it also appears in screenshots of the image.
 */
export function DesignWatermark({ label = "© G4 Builders Inc" }: { label?: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden"
    >
      <div className="absolute -inset-1/2 flex rotate-[-24deg] flex-col justify-center gap-16">
        {Array.from({ length: 9 }, (_, row) => (
          <p
            key={row}
            className={`whitespace-nowrap text-lg font-semibold tracking-[0.3em] text-white/35 uppercase [text-shadow:0_1px_2px_rgb(0_0_0/0.35)] sm:text-2xl ${row % 2 ? "pl-40" : ""}`}
          >
            {Array.from({ length: 8 }, () => label).join("      ")}
          </p>
        ))}
      </div>
    </div>
  );
}
