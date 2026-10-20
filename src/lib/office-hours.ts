/** G4 Builders Inc office hours, in Manila time. Sunday is closed. */
export const officeHoursText =
  "Monday to Friday, 8:00 AM to 12:00 PM and 1:30 PM to 5:00 PM; Saturday, 8:00 AM to 12:00 PM";

type Block = readonly [open: number, close: number];

const weekdayBlocks: Block[] = [[8 * 60, 12 * 60], [13 * 60 + 30, 17 * 60]];
const saturdayBlocks: Block[] = [[8 * 60, 12 * 60]];
const manilaOffsetMs = 8 * 60 * 60 * 1000;

/** Opening blocks in minutes after midnight for a day of the week (0 = Sunday). */
function blocksFor(dayOfWeek: number): Block[] {
  if (dayOfWeek === 0) return [];
  return dayOfWeek === 6 ? saturdayBlocks : weekdayBlocks;
}

/** True when a visit starting at `time` and lasting `minutes` fits inside one opening block. */
export function isWithinOfficeHours(time: Date, minutes = 30) {
  const manila = new Date(time.getTime() + manilaOffsetMs);
  const start = manila.getUTCHours() * 60 + manila.getUTCMinutes();
  return blocksFor(manila.getUTCDay()).some(([open, close]) => start >= open && start + minutes <= close);
}

/** Day of the week for a Manila calendar date written as YYYY-MM-DD. */
function dayOfWeek(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

/** Start times ("HH:MM", every 30 minutes) when a visit of `minutes` fits on a Manila date. */
export function officeTimeSlots(dateKey: string, minutes = 30) {
  const slots: string[] = [];
  for (const [open, close] of blocksFor(dayOfWeek(dateKey))) {
    for (let start = open; start + minutes <= close; start += 30) {
      slots.push(`${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`);
    }
  }
  return slots;
}

/** "13:30" → "1:30 PM". */
export function formatSlot(slot: string) {
  const [hours, minutes] = slot.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** The instant a Manila date and "HH:MM" time refer to, as an ISO string. */
export function manilaDateTime(dateKey: string, slot: string) {
  return new Date(`${dateKey}T${slot}:00.000+08:00`).toISOString();
}
