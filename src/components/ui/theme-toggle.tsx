import { Moon, Sun } from "lucide-react";

type ThemeToggleProps = {
  isLightMode: boolean;
  onToggle: () => void;
};

export function ThemeToggle({ isLightMode, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      aria-label={isLightMode ? "Switch to night mode" : "Switch to light mode"}
      aria-pressed={isLightMode}
      onClick={onToggle}
      className={[
        "flex h-10 items-center gap-2 rounded-full border px-2 text-xs font-semibold transition",
        isLightMode
          ? "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
          : "border-red-900 bg-stone-950 text-stone-100 hover:bg-stone-900",
      ].join(" ")}
    >
      <span
        className={[
          "grid h-7 w-7 place-items-center rounded-full transition",
          isLightMode ? "bg-red-700 text-white" : "bg-stone-800 text-stone-400",
        ].join(" ")}
      >
        <Sun className="h-4 w-4" />
      </span>
      <span
        className={[
          "grid h-7 w-7 place-items-center rounded-full transition",
          isLightMode ? "bg-stone-100 text-stone-400" : "bg-red-700 text-white",
        ].join(" ")}
      >
        <Moon className="h-4 w-4" />
      </span>
    </button>
  );
}
