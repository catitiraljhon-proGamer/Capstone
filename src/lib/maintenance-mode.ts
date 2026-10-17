/** Shared wording for maintenance mode, used by the proxy, the API, and the screens. */

const manilaTime = (date: Date) =>
  date.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const manilaDay = (date: Date) =>
  date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric" });

/** "7:30 PM", or "7:30 PM on October 18" when it ends on another day. */
export function formatMaintenanceEnd(endsAt: string | Date, now = new Date()) {
  const end = new Date(endsAt);
  return manilaDay(end) === manilaDay(now) ? manilaTime(end) : `${manilaTime(end)} on ${manilaDay(end)}`;
}

/** "1 hr 45 min", "20 min", or "less than a minute". */
export function formatTimeLeft(endsAt: string | Date, now = new Date()) {
  const minutes = Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 60_000);
  if (minutes <= 1) return "less than a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} hr` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
}

export function maintenanceNotice(endsAt: string | Date, now = new Date()) {
  return `The system is under maintenance until ${formatMaintenanceEnd(endsAt, now)}. Try again after that.`;
}
