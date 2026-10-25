"use client";

import { PaymentDueCard } from "@/components/billing/payment-due-card";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { dateKey, formatSelectedDay, MonthCalendar, startOfMonth, type CalendarChip } from "@/components/ui/month-calendar";
import { formatPeso } from "@/lib/house-design-data";
import { officeHoursText } from "@/lib/office-hours";
import {
  eventTypeClass,
  formatScheduleDateTime,
  formatScheduleTime,
  groupByDay,
  meetingAboutLabel,
  meetingRequestStatusClass,
  paymentDueClass,
  readScheduleJson,
  scheduleStatusClass,
  toDateTimeInput,
} from "@/lib/schedule-display";
import type { PaymentDueDto } from "@/types/billing";
import type { CustomerMeetingDto, CustomerScheduleData, MeetingMode, MeetingRequestDto } from "@/types/schedules";
import { Banknote, CalendarDays, CalendarPlus, Clock3, Inbox, MapPin, Monitor, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** `relatedTo` is "general", "project:<id>", or "design-request:<id>". */
type RequestForm = { topic: string; relatedTo: string; mode: MeetingMode; preferredTimes: string[]; details: string };

const fieldClass =
  "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

/** The next office day (Monday to Saturday) after `from`, at the same time. */
function nextOfficeDay(from: Date) {
  const date = new Date(from);
  do date.setDate(date.getDate() + 1); while (date.getDay() === 0);
  return date;
}

/** The next office day at 9:00 AM, the earliest suggested meeting time. */
function firstSuggestedTime() {
  const date = nextOfficeDay(new Date());
  date.setHours(9, 0, 0, 0);
  return date;
}

function emptyRequest(): RequestForm {
  return { topic: "", relatedTo: "", mode: "In person", preferredTimes: [toDateTimeInput(firstSuggestedTime())], details: "" };
}

/** The customer's own meetings and payment dates, plus requesting a meeting that the admin approves. */
export function CustomerSchedule() {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [data, setData] = useState<CustomerScheduleData>({ meetings: [], meetingRequests: [], projects: [], designRequests: [], paymentDues: [] });
  const [form, setForm] = useState<RequestForm>(emptyRequest);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/schedules", { cache: "no-store" })
      .then((response) => readScheduleJson<CustomerScheduleData>(response))
      .then((payload) => { if (active) { setData(payload); setError(null); } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load your schedule."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const meetingsByDay = useMemo(() => {
    const sorted = [...data.meetings].sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor));
    return groupByDay(sorted, (meeting) => dateKey(new Date(meeting.scheduledFor)));
  }, [data.meetings]);
  const duesByDay = useMemo(() => groupByDay(data.paymentDues, (due) => due.dueDate), [data.paymentDues]);
  const selectedMeetings = meetingsByDay.get(selectedDate) ?? [];
  const selectedDues = duesByDay.get(selectedDate) ?? [];

  const now = new Date().toISOString();
  const nextMeeting = data.meetings.filter((meeting) => meeting.status === "Scheduled" && meeting.scheduledFor >= now)
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor))[0];
  const nextDue = data.paymentDues.filter((due) => due.status !== "Paid").sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  const pendingRequests = data.meetingRequests.filter((request) => request.status === "Pending");

  const chipsFor = (key: string): CalendarChip[] => [
    ...(meetingsByDay.get(key) ?? []).map((meeting) => ({
      id: meeting.id,
      label: `${formatScheduleTime(meeting.scheduledFor)} ${meeting.title}`,
      className: meeting.status === "Cancelled" ? "border-stone-200 bg-stone-50 text-stone-500 line-through" : eventTypeClass["Client meeting"],
      icon: Users,
    })),
    ...(duesByDay.get(key) ?? []).map((due) => ({ id: due.id, label: `${due.kind} · ${formatPeso(due.balance)}`, className: paymentDueClass[due.status], icon: Banknote })),
  ];

  const openForm = () => {
    setForm(emptyRequest());
    setError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  };

  const setTime = (index: number, value: string) =>
    setForm((current) => ({ ...current, preferredTimes: current.preferredTimes.map((time, position) => (position === index ? value : time)) }));

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (!form.relatedTo) throw new Error("Choose what the meeting is related to.");
      const preferredTimes = form.preferredTimes.map((time) => new Date(time));
      if (preferredTimes.some((time) => Number.isNaN(time.getTime()))) throw new Error("Select a valid date and time for each choice.");
      const response = await fetch("/api/meeting-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: form.topic,
          mode: form.mode,
          preferredTimes: preferredTimes.map((time) => time.toISOString()),
          relatedTo: form.relatedTo,
          ...(form.details.trim() ? { details: form.details.trim() } : {}),
        }),
      });
      const { request } = await readScheduleJson<{ request: MeetingRequestDto }>(response);
      setData((current) => ({ ...current, meetingRequests: [request, ...current.meetingRequests] }));
      setIsFormOpen(false);
      setSuccessMessage("Your meeting request was sent. We will notify you once the admin confirms the time.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to send your request.");
    } finally {
      setIsSaving(false);
    }
  };

  const cancelRequest = async (id: string) => {
    setCancellingId(id);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/meeting-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const { request } = await readScheduleJson<{ request: MeetingRequestDto }>(response);
      setData((current) => ({ ...current, meetingRequests: current.meetingRequests.map((item) => (item.id === request.id ? request : item)) }));
      setSuccessMessage("Your meeting request was cancelled.");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel the request.");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Next Meeting"
          value={nextMeeting ? formatScheduleDateTime(nextMeeting.scheduledFor) : "None scheduled"}
          note={nextMeeting?.title}
          icon={Users}
        />
        <SummaryCard
          label="Next Payment Due"
          value={nextDue ? formatPeso(nextDue.balance) : "Nothing due"}
          note={nextDue ? `${nextDue.label} · ${formatSelectedDay(nextDue.dueDate)}` : undefined}
          icon={Banknote}
        />
        <SummaryCard
          label="Meeting Requests"
          value={pendingRequests.length ? `${pendingRequests.length} waiting` : "None waiting"}
          note={pendingRequests.length ? "The admin will confirm the time" : "Request one anytime"}
          icon={Inbox}
        />
      </div>

      {error && !isFormOpen ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {successMessage ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</p>
      ) : null}

      {isFormOpen ? (
        <FormDialog
          title="Request a Meeting"
          description="Give up to three times that work for you. The admin confirms one or suggests another, and you are notified."
          error={error}
          busy={isSaving}
          onClose={() => setIsFormOpen(false)}
        >
          <form onSubmit={submitRequest} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">
              What is the meeting about?
              <input required minLength={3} maxLength={120} value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} placeholder="Enter meeting topic" className={fieldClass} />
            </label>
            <label className="text-sm font-medium text-stone-700">
              Related To
              <select required value={form.relatedTo} onChange={(event) => setForm({ ...form, relatedTo: event.target.value })} className={fieldClass}>
                <option value="">Select what the meeting is for</option>
                {data.designRequests.length ? (
                  <optgroup label="Design Requests">
                    {data.designRequests.map((request) => <option key={request.id} value={`design-request:${request.id}`}>{request.name}</option>)}
                  </optgroup>
                ) : null}
                {data.projects.length ? (
                  <optgroup label="Construction Projects">
                    {data.projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.reference} · {project.name}</option>)}
                  </optgroup>
                ) : null}
                <option value="general">General inquiry</option>
              </select>
            </label>

            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-stone-700">Meeting Type</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {([["In person", MapPin, "At the G4 Builders Inc office or your project site"], ["Online", Monitor, "Video call; the admin sends the link"]] as const).map(([mode, Icon, hint]) => (
                  <label key={mode} className={`flex min-w-48 flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${form.mode === mode ? "border-red-600 bg-red-50/60" : "border-stone-200"}`}>
                    <input type="radio" name="meeting-mode" checked={form.mode === mode} onChange={() => setForm({ ...form, mode })} className="mt-1 accent-red-700" />
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold text-stone-950"><Icon className="h-4 w-4" />{mode}</span>
                      <span className="mt-0.5 block text-xs text-stone-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-stone-700">Preferred Times</legend>
              <p className="mt-1 text-xs text-stone-500">Office hours: {officeHoursText}. From tomorrow up to 90 days ahead.</p>
              <div className="mt-2 grid gap-3">
                {form.preferredTimes.map((time, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-semibold text-stone-600">
                      Choice {index + 1}
                      <input required type="datetime-local" value={time} min={toDateTimeInput(new Date())} onChange={(event) => setTime(index, event.target.value)} className={fieldClass} />
                    </label>
                    {form.preferredTimes.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, preferredTimes: form.preferredTimes.filter((_, position) => position !== index) })}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"
                        aria-label={`Remove choice ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {form.preferredTimes.length < 3 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    const last = new Date(form.preferredTimes.at(-1) ?? "");
                    const next = Number.isNaN(last.getTime()) ? firstSuggestedTime() : nextOfficeDay(last);
                    setForm({ ...form, preferredTimes: [...form.preferredTimes, toDateTimeInput(next)] });
                  }}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />Add Another Time
                </Button>
              ) : null}
            </fieldset>

            <label className="text-sm font-medium text-stone-700 sm:col-span-2">
              Details (optional)
              <textarea
                maxLength={1000}
                value={form.details}
                onChange={(event) => setForm({ ...form, details: event.target.value })}
                placeholder="Enter anything the team should prepare"
                className="mt-1.5 min-h-24 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
              />
            </label>

            <div className="flex flex-wrap justify-end gap-3 sm:col-span-2">
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Sending…" : "Send Request"}</Button>
            </div>
          </form>
        </FormDialog>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <MonthCalendar
          month={visibleMonth}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onMonthChange={setVisibleMonth}
          chipsFor={chipsFor}
          subtitle="Your meetings and payment due dates."
          isLoading={isLoading}
          actions={<Button type="button" onClick={openForm}><CalendarPlus className="mr-2 h-4 w-4" />Request a Meeting</Button>}
        />

        <aside className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Selected Day</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{formatSelectedDay(selectedDate)}</h2>

          {selectedDues.length > 0 ? (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Payments Due</p>
              {selectedDues.map((due: PaymentDueDto) => (
                <PaymentDueCard
                  key={due.id}
                  due={due}
                  showClient={false}
                  action={due.invoiceNumber && due.status !== "Paid" ? (
                    <Link href="/customer/billing" className="text-sm font-semibold text-red-700 hover:text-red-800">Go to Billing</Link>
                  ) : undefined}
                />
              ))}
            </div>
          ) : null}

          {selectedMeetings.length > 0 ? (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Meetings</p>
              {selectedMeetings.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)}
            </div>
          ) : null}

          {!selectedDues.length && !selectedMeetings.length ? (
            <div className="mt-5 rounded-xl border border-dashed border-stone-200 p-6 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-3 text-sm font-medium text-stone-700">Nothing Scheduled for This Day</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">Need to talk with the team? Use Request a Meeting above the calendar.</p>
            </div>
          ) : null}
        </aside>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">My Meeting Requests</h2>
        {data.meetingRequests.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">You have not requested a meeting yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-stone-100">
            {data.meetingRequests.map((request) => (
              <article key={request.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-semibold text-stone-950">{request.topic}</h3>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${meetingRequestStatusClass[request.status]}`}>{request.status}</span>
                    <span className="text-xs text-stone-500">{request.mode}</span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">Related to: {meetingAboutLabel(request)}</p>
                  {request.status === "Approved" && request.scheduledFor ? (
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-700"><Clock3 className="h-4 w-4" />Scheduled for {formatScheduleDateTime(request.scheduledFor)}</p>
                  ) : (
                    <p className="mt-2 text-sm text-stone-600">Your times: {request.preferredTimes.map(formatScheduleDateTime).join(" · ")}</p>
                  )}
                  {request.status === "Declined" && request.declineReason ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Reason: {request.declineReason}</p>
                  ) : null}
                </div>
                {request.status === "Pending" ? (
                  <Button type="button" variant="outline" size="sm" disabled={cancellingId === request.id} onClick={() => void cancelRequest(request.id)}>
                    {cancellingId === request.id ? "Cancelling…" : "Cancel Request"}
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, note, icon: Icon }: { label: string; value: string; note?: string; icon: typeof Users }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
          {note ? <p className="mt-1 truncate text-xs text-stone-500">{note}</p> : null}
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      </div>
    </section>
  );
}

function MeetingCard({ meeting }: { meeting: CustomerMeetingDto }) {
  return (
    <article className="rounded-xl border border-stone-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-stone-950">{meeting.title}</h3>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${scheduleStatusClass[meeting.status]}`}>{meeting.status}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm text-stone-600">
        <p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />{formatScheduleDateTime(meeting.scheduledFor)} · {meeting.durationMinutes} min</p>
        {meeting.projectName ?? meeting.designRequestName ? <p className="pl-6 text-xs">{meeting.projectName ?? meeting.designRequestName}</p> : null}
        {meeting.location ? (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            {/^https?:\/\//.test(meeting.location)
              ? <a href={meeting.location} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-red-700 hover:text-red-800">{meeting.location}</a>
              : <span className="break-all">{meeting.location}</span>}
          </p>
        ) : null}
      </div>
    </article>
  );
}
