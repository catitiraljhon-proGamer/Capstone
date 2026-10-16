"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export type CalendarChip = {
  id: string;
  label: string;
  className: string;
  icon?: ComponentType<{ className?: string }>;
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const visibleChips = 3;

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Local calendar day as YYYY-MM-DD. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calendarDays(month: Date) {
  const gridStart = startOfMonth(month);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

/** A month grid with up to three chips per day; selecting a day outside the month moves to that month. */
export function MonthCalendar({
  month,
  selectedDate,
  onSelectDate,
  onMonthChange,
  chipsFor,
  subtitle,
  actions,
  isLoading = false,
}: {
  month: Date;
  selectedDate: string;
  onSelectDate: (key: string) => void;
  onMonthChange: (month: Date) => void;
  chipsFor: (key: string) => CalendarChip[];
  subtitle: string;
  actions?: ReactNode;
  isLoading?: boolean;
}) {
  const todayKey = dateKey(new Date());
  const moveMonth = (offset: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + offset, 1));

  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {month.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}
          </h2>
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onMonthChange(startOfMonth(new Date()));
              onSelectDate(todayKey);
            }}
          >
            Today
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => moveMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => moveMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {actions}
        </div>
      </div>

      {isLoading ? (
        <p className="p-6 text-sm text-stone-500">Loading calendar…</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
              {weekdays.map((weekday) => (
                <div key={weekday} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {weekday}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays(month).map((day) => {
                const key = dateKey(day);
                const chips = chipsFor(key);
                const isCurrentMonth = day.getMonth() === month.getMonth();
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onSelectDate(key);
                      if (!isCurrentMonth) onMonthChange(startOfMonth(day));
                    }}
                    className={[
                      "min-h-28 border-b border-r border-stone-200 p-2 text-left align-top transition hover:bg-red-50/50 focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-600",
                      key === selectedDate ? "bg-red-50/70" : "bg-white",
                      isCurrentMonth ? "text-stone-950" : "text-stone-400",
                    ].join(" ")}
                  >
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${key === todayKey ? "bg-red-700 text-white" : ""}`}>
                      {day.getDate()}
                    </span>
                    <span className="mt-1 block space-y-1">
                      {chips.slice(0, visibleChips).map((chip) => (
                        <span key={chip.id} className={`flex items-center gap-1 truncate rounded border px-1.5 py-1 text-[11px] font-medium ${chip.className}`}>
                          {chip.icon ? <chip.icon className="h-3 w-3 shrink-0" /> : null}
                          <span className="truncate">{chip.label}</span>
                        </span>
                      ))}
                      {chips.length > visibleChips ? (
                        <span className="block px-1 text-[11px] font-medium text-stone-500">+{chips.length - visibleChips} more</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Long weekday-and-date heading for the selected day panel. */
export function formatSelectedDay(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
