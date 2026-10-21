"use client";

import { AdminMeetingRequests } from "@/components/admin/admin-meeting-requests";
import { PaymentDueCard } from "@/components/billing/payment-due-card";
import { Button } from "@/components/ui/button";
import { dateKey, formatSelectedDay, MonthCalendar, startOfMonth, type CalendarChip } from "@/components/ui/month-calendar";
import { FormDialog } from "@/components/ui/form-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatPeso } from "@/lib/house-design-data";
import {
  eventTypeClass,
  formatScheduleDateTime,
  formatScheduleTime,
  groupByDay,
  paymentDueClass,
  readScheduleJson,
  scheduleStatusClass,
} from "@/lib/schedule-display";
import type { PaymentDueDto } from "@/types/billing";
import type { MeetingRequestDto, ScheduleDto, ScheduleEventType, ScheduleStatus, StaffScheduleData } from "@/types/schedules";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CalendarDays,
  Clock3,
  FileClock,
  Inbox,
  MapPin,
  PhoneCall,
  Plus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";

type StaffRole = "admin" | "billing-clerk";

type ScheduleForm = {
  title: string;
  clientId: string;
  projectId: string;
  scheduledFor: string;
  durationMinutes: string;
  location: string;
  notes: string;
  status: ScheduleStatus;
};

/** Each role adds and updates one kind of event; the other kind and all payment dates are view-only. */
const roleCopy: Record<StaffRole, {
  managed: ScheduleEventType;
  newLabel: string;
  formDescription: string;
  titlePlaceholder: string;
  notesPlaceholder: string;
  subtitle: string;
  emptyHint: string;
}> = {
  admin: {
    managed: "Client meeting",
    newLabel: "New Meeting",
    formDescription: "Arrange a client meeting and record its agenda. The client is notified.",
    titlePlaceholder: "Example: Contract review meeting",
    notesPlaceholder: "Agenda, reminders, or preparation notes (staff only)",
    subtitle: "Client meetings and customer payment dates in one calendar.",
    emptyHint: "Use New Meeting above to add one to this date.",
  },
  "billing-clerk": {
    managed: "Payment follow-up",
    newLabel: "New Follow-Up",
    formDescription: "Plan a call or reminder about a customer payment. Follow-ups are internal; customers do not see them.",
    titlePlaceholder: "Example: Call about the downpayment",
    notesPlaceholder: "What to discuss or check (staff only)",
    subtitle: "Customer payment dates, your follow-ups, and client meetings.",
    emptyHint: "Use New Follow-Up above to add one to this date.",
  },
};

const fieldClass =
  "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";
const textareaClass =
  "mt-1.5 min-h-24 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

function emptyForm(day: string, prefill: Partial<ScheduleForm> = {}): ScheduleForm {
  return {
    title: "", clientId: "", projectId: "", scheduledFor: `${day}T09:00`, durationMinutes: "60",
    location: "", notes: "", status: "Scheduled", ...prefill,
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function StaffScheduleCalendar({ role }: { role: StaffRole }) {
  const copy = roleCopy[role];
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [data, setData] = useState<StaffScheduleData>({ schedules: [], meetingRequests: [], clients: [], projects: [], paymentDues: [] });
  const [form, setForm] = useState<ScheduleForm>(() => emptyForm(dateKey(new Date())));
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/schedules", { cache: "no-store" })
      .then((response) => readScheduleJson<StaffScheduleData>(response))
      .then((payload) => { if (active) { setData(payload); setError(null); } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load the schedule."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const schedulesByDay = useMemo(() => {
    const sorted = [...data.schedules].sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor));
    return groupByDay(sorted, (schedule) => dateKey(new Date(schedule.scheduledFor)));
  }, [data.schedules]);
  const duesByDay = useMemo(() => groupByDay(data.paymentDues, (due) => due.dueDate), [data.paymentDues]);
  const selectedSchedules = schedulesByDay.get(selectedDate) ?? [];
  const selectedDues = duesByDay.get(selectedDate) ?? [];

  const monthPrefix = dateKey(visibleMonth).slice(0, 7);
  const monthSchedules = data.schedules.filter((schedule) => dateKey(new Date(schedule.scheduledFor)).startsWith(monthPrefix));
  const managedThisMonth = monthSchedules.filter((schedule) => schedule.eventType === copy.managed);
  const monthDues = data.paymentDues.filter((due) => due.dueDate.startsWith(monthPrefix));
  const unpaidMonthDues = monthDues.filter((due) => due.status !== "Paid");
  const overdueDues = data.paymentDues.filter((due) => due.status === "Overdue");
  const clientProjects = data.projects.filter((project) => project.clientId === form.clientId);
  const clientOptions = useMemo(() => data.clients.map((client) => ({ value: client.id, label: client.name })), [data.clients]);

  const metrics: { label: string; value: number; note?: string; icon: ComponentType<{ className?: string }> }[] = role === "admin"
    ? [
      { label: "Meetings Scheduled This Month", value: managedThisMonth.filter((schedule) => schedule.status === "Scheduled").length, icon: Users },
      { label: "Completed Meetings", value: managedThisMonth.filter((schedule) => schedule.status === "Completed").length, icon: CalendarDays },
      { label: "Meeting Requests", value: data.meetingRequests.length, note: data.meetingRequests.length ? "Waiting for your reply" : "None waiting", icon: Inbox },
      { label: "Customer Payments Due This Month", value: unpaidMonthDues.length, note: `${formatPeso(sum(unpaidMonthDues.map((due) => due.balance)))} outstanding`, icon: Banknote },
      { label: "Overdue Customer Payments", value: overdueDues.length, note: overdueDues.length ? `${formatPeso(sum(overdueDues.map((due) => due.balance)))} past due` : "None past due", icon: AlertTriangle },
    ]
    : [
      { label: "Payments Due This Month", value: unpaidMonthDues.length, note: `${formatPeso(sum(unpaidMonthDues.map((due) => due.balance)))} outstanding`, icon: Banknote },
      { label: "Overdue Payments", value: overdueDues.length, note: overdueDues.length ? `${formatPeso(sum(overdueDues.map((due) => due.balance)))} past due` : "None past due", icon: AlertTriangle },
      { label: "Not Yet Invoiced This Month", value: monthDues.filter((due) => due.status === "Upcoming").length, note: "Milestones still to bill", icon: FileClock },
      { label: "Follow-Ups This Month", value: managedThisMonth.filter((schedule) => schedule.status === "Scheduled").length, note: "Scheduled calls and reminders", icon: PhoneCall },
    ];

  const chipsFor = (key: string): CalendarChip[] => [
    ...(schedulesByDay.get(key) ?? []).map((schedule) => ({
      id: schedule.id,
      label: `${formatScheduleTime(schedule.scheduledFor)} ${schedule.title}`,
      className: schedule.status === "Cancelled" ? "border-stone-200 bg-stone-50 text-stone-500 line-through" : eventTypeClass[schedule.eventType],
      icon: schedule.eventType === "Payment follow-up" ? PhoneCall : undefined,
    })),
    ...(duesByDay.get(key) ?? []).map((due) => ({ id: due.id, label: `${due.kind} · ${due.clientName}`, className: paymentDueClass[due.status], icon: Banknote })),
  ];

  const openForm = (prefill: Partial<ScheduleForm> = {}) => {
    setForm(emptyForm(selectedDate, prefill));
    setError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  };

  const showSchedule = (schedule: ScheduleDto) => {
    setData((current) => ({ ...current, schedules: [...current.schedules.filter((item) => item.id !== schedule.id), schedule] }));
    setSelectedDate(dateKey(new Date(schedule.scheduledFor)));
    setVisibleMonth(startOfMonth(new Date(schedule.scheduledFor)));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const scheduledFor = new Date(form.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime())) throw new Error("Select a valid date and time.");
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scheduledFor: scheduledFor.toISOString(),
          // Follow-ups are reminders, so only meetings carry a duration.
          durationMinutes: role === "admin" ? Number(form.durationMinutes) : undefined,
        }),
      });
      const { schedule } = await readScheduleJson<{ schedule: ScheduleDto }>(response);
      showSchedule(schedule);
      setIsFormOpen(false);
      setSuccessMessage(`${schedule.title} was added to the calendar.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the schedule.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (id: string, status: ScheduleStatus) => {
    setUpdatingId(id);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const { schedule } = await readScheduleJson<{ schedule: ScheduleDto }>(response);
      setData((current) => ({ ...current, schedules: current.schedules.map((item) => (item.id === schedule.id ? schedule : item)) }));
      setSuccessMessage(`${schedule.title} was updated.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update the schedule.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Placed next to Duration for meetings, and next to Date and Time for follow-ups.
  const statusField = (
    <label className="text-sm font-medium text-stone-700">
      Status
      <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ScheduleStatus })} className={fieldClass}>
        <option>Scheduled</option>
        <option>Completed</option>
        <option>Cancelled</option>
      </select>
    </label>
  );

  const handleRequestAnswered =(request: MeetingRequestDto, schedule?: ScheduleDto) => {
    setData((current) => ({ ...current, meetingRequests: current.meetingRequests.filter((item) => item.id !== request.id) }));
    if (schedule) showSchedule(schedule);
    setSuccessMessage(schedule ? `${schedule.title} was added to the calendar and the client was notified.` : `The request from ${request.customerName} was declined.`);
  };

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 sm:grid-cols-2 ${role === "admin" ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {metrics.map((item) => (
          <section key={item.label} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-stone-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{item.value}</p>
                {item.note ? <p className="mt-1 text-xs text-stone-500">{item.note}</p> : null}
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </section>
        ))}
      </div>

      {error && !isFormOpen ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {successMessage ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</p>
      ) : null}

      {role === "admin" && data.meetingRequests.length > 0 ? (
        <AdminMeetingRequests requests={data.meetingRequests} onAnswered={handleRequestAnswered} />
      ) : null}

      {isFormOpen ? (
        <FormDialog title={copy.newLabel} description={copy.formDescription} error={error} busy={isSaving} onClose={() => setIsFormOpen(false)}>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-stone-700 sm:col-span-2">
              Title
              <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={copy.titlePlaceholder} className={fieldClass} />
            </label>
            <div className="text-sm font-medium text-stone-700 sm:col-span-2">
              <label htmlFor="schedule-client">Client</label>
              <SearchableSelect
                id="schedule-client"
                required
                value={form.clientId}
                onChange={(clientId) => setForm({ ...form, clientId, projectId: "" })}
                options={clientOptions}
                placeholder="Search client by name"
                emptyMessage="No client matches that name."
                className={fieldClass}
              />
            </div>
            <label className="text-sm font-medium text-stone-700 sm:col-span-2">
              Project (optional)
              <select value={form.projectId} disabled={!form.clientId} onChange={(event) => setForm({ ...form, projectId: event.target.value })} className={fieldClass}>
                <option value="">No Linked Project</option>
                {clientProjects.map((project) => <option key={project.id} value={project.id}>{project.reference} · {project.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-stone-700">
              Date and Time
              <input required type="datetime-local" value={form.scheduledFor} onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })} className={fieldClass} />
            </label>
            {role === "admin" ? (
              <label className="text-sm font-medium text-stone-700">
                Duration
                <select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} className={fieldClass}>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">1 hour 30 minutes</option>
                  <option value="120">2 hours</option>
                </select>
              </label>
            ) : null}
            {role === "admin" ? null : statusField}
            <label className="text-sm font-medium text-stone-700">
              {role === "admin" ? "Location or meeting link (optional)" : "Phone number or channel (optional)"}
              <input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder={role === "admin" ? "Office, project site, or video-call link" : "Example: Phone call, Messenger, or email"}
                className={fieldClass}
              />
            </label>
            {role === "admin" ? statusField : null}
            <label className="text-sm font-medium text-stone-700 sm:col-span-2">
              Notes (optional)
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={copy.notesPlaceholder} className={textareaClass} />
            </label>
            <div className="flex flex-wrap justify-end gap-3 sm:col-span-2">
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving || data.clients.length === 0}>{isSaving ? "Saving…" : "Add to Calendar"}</Button>
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
          subtitle={copy.subtitle}
          isLoading={isLoading}
          actions={<Button type="button" onClick={() => openForm()}><Plus className="mr-2 h-4 w-4" />{copy.newLabel}</Button>}
        />

        <aside className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Selected Day</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{formatSelectedDay(selectedDate)}</h2>

          {selectedDues.length > 0 ? (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Customer Payments Due</p>
              {selectedDues.map((due: PaymentDueDto) => (
                <PaymentDueCard
                  key={due.id}
                  due={due}
                  action={role === "billing-clerk" && due.status !== "Paid" ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => openForm({ clientId: due.clientId, title: `Follow up: ${due.label}` })}>
                      <PhoneCall className="mr-2 h-3.5 w-3.5" />Add Follow-Up
                    </Button>
                  ) : undefined}
                />
              ))}
              {role === "admin" ? <p className="text-xs leading-5 text-stone-500">Payment dates are view-only here. The Billing Clerk issues invoices and verifies payments.</p> : null}
            </div>
          ) : null}

          {selectedSchedules.length > 0 ? (
            <div className="mt-5 space-y-4">
              {selectedSchedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  canUpdate={schedule.eventType === copy.managed}
                  isUpdating={updatingId === schedule.id}
                  onStatusChange={(status) => void updateStatus(schedule.id, status)}
                />
              ))}
            </div>
          ) : selectedDues.length > 0 ? null : (
            <div className="mt-5 rounded-xl border border-dashed border-stone-200 p-6 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-3 text-sm font-medium text-stone-700">Nothing Scheduled for This Day</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">{copy.emptyHint}</p>
            </div>
          )}

          <div className="mt-5 border-t border-stone-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Legend</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {(role === "admin" ? ["Client meeting"] as const : ["Payment follow-up", "Client meeting"] as const).map((eventType) => (
                <span key={eventType} className={`rounded border px-2 py-1 ${eventTypeClass[eventType]}`}>{eventType}</span>
              ))}
              {(Object.keys(paymentDueClass) as PaymentDueDto["status"][]).map((status) => (
                <span key={status} className={`inline-flex items-center gap-1 rounded border px-2 py-1 ${paymentDueClass[status]}`}>
                  <Banknote className="h-3 w-3" aria-hidden="true" />
                  Payment {status.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScheduleCard({ schedule, canUpdate, isUpdating, onStatusChange }: {
  schedule: ScheduleDto;
  canUpdate: boolean;
  isUpdating: boolean;
  onStatusChange: (status: ScheduleStatus) => void;
}) {
  return (
    <article className="rounded-xl border border-stone-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className={`inline-flex rounded border px-2 py-1 text-xs font-semibold ${eventTypeClass[schedule.eventType]}`}>{schedule.eventType}</span>
          <h3 className="mt-2 font-semibold text-stone-950">{schedule.title}</h3>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${scheduleStatusClass[schedule.status]}`}>{schedule.status}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm text-stone-600">
        <p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />{formatScheduleDateTime(schedule.scheduledFor)}{schedule.eventType === "Client meeting" ? ` · ${schedule.durationMinutes} min` : ""}</p>
        <p className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0" />{schedule.clientName}</p>
        {schedule.projectName ? <p className="pl-6 text-xs">{schedule.projectName}</p> : null}
        {schedule.location ? <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-all">{schedule.location}</span></p> : null}
        {schedule.notes ? <p className="whitespace-pre-line rounded-lg bg-stone-50 p-3 text-xs leading-5">{schedule.notes}</p> : null}
        <p className="flex items-start gap-2 text-xs text-stone-500"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />Added by {schedule.createdByName}</p>
      </div>
      {canUpdate ? (
        <label className="mt-4 block border-t border-stone-200 pt-4 text-xs font-semibold text-stone-600">
          Status
          <select value={schedule.status} disabled={isUpdating} onChange={(event) => onStatusChange(event.target.value as ScheduleStatus)} className={`${fieldClass} mt-1 h-9`}>
            <option>Scheduled</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
        </label>
      ) : (
        <p className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-500">View only · Managed by the {schedule.eventType === "Client meeting" ? "Admin" : "Billing Clerk"}.</p>
      )}
    </article>
  );
}
