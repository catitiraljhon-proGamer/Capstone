import type { PaymentDueDto } from "@/types/billing";
import type { MeetingRequestStatus, ScheduleEventType, ScheduleStatus } from "@/types/schedules";

/** What a meeting or meeting request is about; one without a project or design request is a general inquiry. */
export function meetingAboutLabel(item: { projectName?: string; designRequestName?: string }) {
  return item.projectName ?? item.designRequestName ?? "General inquiry";
}

export const eventTypeClass: Record<ScheduleEventType, string> = {
  "Client meeting": "border-red-200 bg-red-50 text-red-800",
  "Payment follow-up": "border-violet-200 bg-violet-50 text-violet-800",
};

export const paymentDueClass: Record<PaymentDueDto["status"], string> = {
  Upcoming: "border-stone-300 bg-stone-50 text-stone-700",
  Due: "border-amber-200 bg-amber-50 text-amber-800",
  "Partially paid": "border-sky-200 bg-sky-50 text-sky-800",
  Paid: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Overdue: "border-red-400 bg-white text-red-800",
};

export const scheduleStatusClass: Record<ScheduleStatus, string> = {
  Scheduled: "bg-blue-50 text-blue-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-stone-100 text-stone-600",
};

export const meetingRequestStatusClass: Record<MeetingRequestStatus, string> = {
  Pending: "bg-amber-50 text-amber-800",
  Approved: "bg-emerald-50 text-emerald-700",
  Declined: "bg-red-50 text-red-700",
  Cancelled: "bg-stone-100 text-stone-600",
};

export function formatScheduleDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

export function formatScheduleTime(value: string) {
  return new Date(value).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/** Value for a datetime-local input, in the browser's time zone. */
export function toDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function groupByDay<T>(items: T[], keyOf: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(keyOf(item), [...(grouped.get(keyOf(item)) ?? []), item]);
  return grouped;
}

/** Parses a JSON response and throws its `error` message when the request failed. */
export async function readScheduleJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The schedule request could not be completed.");
  return payload;
}
