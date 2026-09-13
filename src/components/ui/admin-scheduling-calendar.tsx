"use client";

import { Button } from "@/components/ui/button";
import { formatPeso } from "@/components/ui/house-design-data";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  Plus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ScheduleEventType =
  | "Client meeting"
  | "Payment follow-up"
  | "Payment due";
type ScheduleStatus = "Scheduled" | "Completed" | "Cancelled";
type PaymentStatus =
  | "Not applicable"
  | "Expected"
  | "Pending"
  | "Paid"
  | "Overdue";

type ScheduleDto = {
  id: string;
  title: string;
  eventType: ScheduleEventType;
  clientId: string;
  clientName: string;
  projectId?: string;
  projectName?: string;
  scheduledFor: string;
  durationMinutes: number;
  location?: string;
  notes?: string;
  status: ScheduleStatus;
  paymentStatus: PaymentStatus;
  expectedAmount?: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

type ClientDto = { id: string; name: string; email: string };
type ProjectDto = {
  id: string;
  clientId: string;
  reference: string;
  name: string;
};

type ScheduleForm = {
  title: string;
  eventType: ScheduleEventType;
  clientId: string;
  projectId: string;
  scheduledFor: string;
  durationMinutes: string;
  location: string;
  notes: string;
  status: ScheduleStatus;
  paymentStatus: PaymentStatus;
  expectedAmount: string;
};

const eventTypeClass: Record<ScheduleEventType, string> = {
  "Client meeting": "border-red-200 bg-red-50 text-red-800",
  "Payment follow-up": "border-amber-200 bg-amber-50 text-amber-800",
  "Payment due": "border-blue-200 bg-blue-50 text-blue-800",
};

const statusClass: Record<ScheduleStatus, string> = {
  Scheduled: "bg-blue-50 text-blue-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-stone-100 text-stone-600",
};

const paymentStatusClass: Record<PaymentStatus, string> = {
  "Not applicable": "bg-stone-100 text-stone-600",
  Expected: "bg-blue-50 text-blue-700",
  Pending: "bg-amber-50 text-amber-700",
  Paid: "bg-emerald-50 text-emerald-700",
  Overdue: "bg-red-50 text-red-700",
};

const fieldClass =
  "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";
const textareaClass =
  "mt-1.5 min-h-24 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDays(month: Date) {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function dateTimeInputValue(day: string, time = "09:00") {
  return `${day}T${time}`;
}

function emptyForm(day: string): ScheduleForm {
  return {
    title: "",
    eventType: "Client meeting",
    clientId: "",
    projectId: "",
    scheduledFor: dateTimeInputValue(day),
    durationMinutes: "60",
    location: "",
    notes: "",
    status: "Scheduled",
    paymentStatus: "Not applicable",
    expectedAmount: "",
  };
}

function formatScheduleDate(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "The schedule request could not be completed.");
  }
  return payload;
}

export function AdminSchedulingCalendar() {
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(today));
  const [schedules, setSchedules] = useState<ScheduleDto[]>([]);
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [form, setForm] = useState<ScheduleForm>(() => emptyForm(dateKey(today)));
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/schedules", { cache: "no-store" })
      .then((response) =>
        readJson<{
          schedules: ScheduleDto[];
          clients: ClientDto[];
          projects: ProjectDto[];
        }>(response),
      )
      .then((payload) => {
        if (!active) return;
        setSchedules(payload.schedules);
        setClients(payload.clients);
        setProjects(payload.projects);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the schedule.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);
  const schedulesByDay = useMemo(() => {
    const grouped = new Map<string, ScheduleDto[]>();

    for (const schedule of schedules) {
      const key = dateKey(new Date(schedule.scheduledFor));
      const items = grouped.get(key) ?? [];
      items.push(schedule);
      grouped.set(key, items);
    }

    for (const items of grouped.values()) {
      items.sort(
        (left, right) =>
          new Date(left.scheduledFor).getTime() -
          new Date(right.scheduledFor).getTime(),
      );
    }

    return grouped;
  }, [schedules]);
  const selectedSchedules = schedulesByDay.get(selectedDate) ?? [];
  const clientProjects = projects.filter(
    (project) => project.clientId === form.clientId,
  );
  const currentMonthSchedules = schedules.filter((schedule) => {
    const date = new Date(schedule.scheduledFor);
    return (
      date.getFullYear() === visibleMonth.getFullYear() &&
      date.getMonth() === visibleMonth.getMonth()
    );
  });
  const scheduledMeetings = currentMonthSchedules.filter(
    (schedule) =>
      schedule.eventType === "Client meeting" && schedule.status === "Scheduled",
  ).length;
  const upcomingPayments = currentMonthSchedules.filter(
    (schedule) =>
      schedule.eventType !== "Client meeting" &&
      ["Expected", "Pending"].includes(schedule.paymentStatus),
  ).length;
  const overduePayments = currentMonthSchedules.filter(
    (schedule) => schedule.paymentStatus === "Overdue",
  ).length;

  const openForm = () => {
    setForm(emptyForm(selectedDate));
    setError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  };

  const selectDay = (day: Date) => {
    setSelectedDate(dateKey(day));
    if (
      day.getMonth() !== visibleMonth.getMonth() ||
      day.getFullYear() !== visibleMonth.getFullYear()
    ) {
      setVisibleMonth(startOfMonth(day));
    }
  };

  const moveMonth = (offset: number) => {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  };

  const goToToday = () => {
    const current = new Date();
    setVisibleMonth(startOfMonth(current));
    setSelectedDate(dateKey(current));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const localScheduleDate = new Date(form.scheduledFor);
      if (Number.isNaN(localScheduleDate.getTime())) {
        throw new Error("Select a valid schedule date and time.");
      }

      const payload = {
        ...form,
        scheduledFor: localScheduleDate.toISOString(),
        durationMinutes: Number(form.durationMinutes),
        expectedAmount:
          form.eventType === "Client meeting" || !form.expectedAmount
            ? undefined
            : Number(form.expectedAmount),
      };
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const { schedule } = await readJson<{ schedule: ScheduleDto }>(response);
      setSchedules((current) => [...current, schedule]);
      setSelectedDate(dateKey(new Date(schedule.scheduledFor)));
      setVisibleMonth(startOfMonth(new Date(schedule.scheduledFor)));
      setIsFormOpen(false);
      setForm(emptyForm(dateKey(new Date(schedule.scheduledFor))));
      setSuccessMessage(`${schedule.title} was added to the calendar.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create the schedule.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateSchedule = async (
    id: string,
    changes: Partial<Pick<ScheduleDto, "status" | "paymentStatus">>,
  ) => {
    setUpdatingId(id);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const { schedule } = await readJson<{ schedule: ScheduleDto }>(response);
      setSchedules((current) =>
        current.map((item) => (item.id === schedule.id ? schedule : item)),
      );
      setSuccessMessage(`${schedule.title} was updated.`);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update the schedule.",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Events this month",
            value: currentMonthSchedules.length,
            icon: CalendarDays,
          },
          { label: "Scheduled meetings", value: scheduledMeetings, icon: Users },
          { label: "Upcoming payments", value: upcomingPayments, icon: CreditCard },
          { label: "Overdue payments", value: overduePayments, icon: Clock3 },
        ].map((item) => (
          <section
            key={item.label}
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-stone-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {item.value}
                </p>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-700">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </section>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {successMessage}
        </p>
      ) : null}

      {isFormOpen ? (
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">New schedule</h2>
              <p className="mt-1 text-sm text-stone-600">
                Add a client meeting, payment follow-up, or next payment date.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"
              aria-label="Close schedule form"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-medium text-stone-700 xl:col-span-2">
              Schedule title
              <input
                required
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Example: Contract review meeting"
                className={fieldClass}
              />
            </label>

            <label className="text-sm font-medium text-stone-700">
              Schedule type
              <select
                value={form.eventType}
                onChange={(event) => {
                  const eventType = event.target.value as ScheduleEventType;
                  setForm({
                    ...form,
                    eventType,
                    paymentStatus:
                      eventType === "Client meeting" ? "Not applicable" : "Expected",
                    expectedAmount:
                      eventType === "Client meeting" ? "" : form.expectedAmount,
                  });
                }}
                className={fieldClass}
              >
                <option>Client meeting</option>
                <option>Payment follow-up</option>
                <option>Payment due</option>
              </select>
            </label>

            <label className="text-sm font-medium text-stone-700">
              Client
              <select
                required
                value={form.clientId}
                onChange={(event) =>
                  setForm({ ...form, clientId: event.target.value, projectId: "" })
                }
                className={fieldClass}
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} · {client.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-stone-700 xl:col-span-2">
              Project (optional)
              <select
                value={form.projectId}
                disabled={!form.clientId}
                onChange={(event) => setForm({ ...form, projectId: event.target.value })}
                className={fieldClass}
              >
                <option value="">No linked project</option>
                {clientProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.reference} · {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-stone-700">
              Date and time
              <input
                required
                type="datetime-local"
                value={form.scheduledFor}
                onChange={(event) =>
                  setForm({ ...form, scheduledFor: event.target.value })
                }
                className={fieldClass}
              />
            </label>

            <label className="text-sm font-medium text-stone-700">
              Duration
              <select
                value={form.durationMinutes}
                onChange={(event) =>
                  setForm({ ...form, durationMinutes: event.target.value })
                }
                className={fieldClass}
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1 hour 30 minutes</option>
                <option value="120">2 hours</option>
              </select>
            </label>

            <label className="text-sm font-medium text-stone-700 xl:col-span-2">
              Location or meeting link (optional)
              <input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder="Office, project site, or video-call link"
                className={fieldClass}
              />
            </label>

            <label className="text-sm font-medium text-stone-700">
              Schedule status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as ScheduleStatus })
                }
                className={fieldClass}
              >
                <option>Scheduled</option>
                <option>Completed</option>
                <option>Cancelled</option>
              </select>
            </label>

            {form.eventType !== "Client meeting" ? (
              <>
                <label className="text-sm font-medium text-stone-700">
                  Payment status
                  <select
                    value={form.paymentStatus}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        paymentStatus: event.target.value as PaymentStatus,
                      })
                    }
                    className={fieldClass}
                  >
                    <option>Expected</option>
                    <option>Pending</option>
                    <option>Paid</option>
                    <option>Overdue</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-stone-700 xl:col-span-2">
                  Expected amount (optional)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.expectedAmount}
                    onChange={(event) =>
                      setForm({ ...form, expectedAmount: event.target.value })
                    }
                    placeholder="0.00"
                    className={fieldClass}
                  />
                </label>
              </>
            ) : null}

            <label className="text-sm font-medium text-stone-700 md:col-span-2 xl:col-span-4">
              Notes (optional)
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Agenda, payment commitment, reminders, or preparation notes"
                className={textareaClass}
              />
            </label>

            <div className="flex flex-wrap justify-end gap-3 md:col-span-2 xl:col-span-4">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || clients.length === 0}>
                {isSaving ? "Saving…" : "Add to calendar"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {visibleMonth.toLocaleDateString("en-PH", {
                  month: "long",
                  year: "numeric",
                })}
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                Meetings and payment commitments in one calendar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => moveMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => moveMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" onClick={openForm}>
                <Plus className="mr-2 h-4 w-4" />
                New schedule
              </Button>
            </div>
          </div>

          {isLoading ? (
            <p className="p-6 text-sm text-stone-500">Loading calendar…</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((weekday) => (
                    <div
                      key={weekday}
                      className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-stone-500"
                    >
                      {weekday.slice(0, 3)}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((day) => {
                    const key = dateKey(day);
                    const daySchedules = schedulesByDay.get(key) ?? [];
                    const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
                    const isSelected = key === selectedDate;
                    const isToday = key === dateKey(today);

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectDay(day)}
                        className={[
                          "min-h-28 border-b border-r border-stone-200 p-2 text-left align-top transition hover:bg-red-50/50 focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-600",
                          isSelected ? "bg-red-50/70" : "bg-white",
                          isCurrentMonth ? "text-stone-950" : "text-stone-400",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold",
                            isToday ? "bg-red-700 text-white" : "",
                          ].join(" ")}
                        >
                          {day.getDate()}
                        </span>
                        <span className="mt-1 block space-y-1">
                          {daySchedules.slice(0, 3).map((schedule) => (
                            <span
                              key={schedule.id}
                              className={`block truncate rounded border px-1.5 py-1 text-[11px] font-medium ${eventTypeClass[schedule.eventType]}`}
                            >
                              {new Date(schedule.scheduledFor).toLocaleTimeString("en-PH", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}{" "}
                              {schedule.title}
                            </span>
                          ))}
                          {daySchedules.length > 3 ? (
                            <span className="block px-1 text-[11px] font-medium text-stone-500">
                              +{daySchedules.length - 3} more
                            </span>
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

        <aside className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Selected day
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">
                {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-PH", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h2>
            </div>
            <Button type="button" size="icon" onClick={openForm} aria-label="Add schedule">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {selectedSchedules.length > 0 ? (
            <div className="mt-5 space-y-4">
              {selectedSchedules.map((schedule) => (
                <article key={schedule.id} className="rounded-xl border border-stone-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span
                        className={`inline-flex rounded border px-2 py-1 text-xs font-semibold ${eventTypeClass[schedule.eventType]}`}
                      >
                        {schedule.eventType}
                      </span>
                      <h3 className="mt-2 font-semibold text-stone-950">{schedule.title}</h3>
                    </div>
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClass[schedule.status]}`}>
                      {schedule.status}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-stone-600">
                    <p className="flex items-start gap-2">
                      <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                      {formatScheduleDate(schedule.scheduledFor)} · {schedule.durationMinutes} min
                    </p>
                    <p className="flex items-start gap-2">
                      <Users className="mt-0.5 h-4 w-4 shrink-0" />
                      {schedule.clientName}
                    </p>
                    {schedule.projectName ? (
                      <p className="pl-6 text-xs">{schedule.projectName}</p>
                    ) : null}
                    {schedule.location ? (
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="break-all">{schedule.location}</span>
                      </p>
                    ) : null}
                    {schedule.eventType !== "Client meeting" ? (
                      <p className="flex flex-wrap items-center gap-2">
                        <CreditCard className="h-4 w-4 shrink-0" />
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${paymentStatusClass[schedule.paymentStatus]}`}>
                          {schedule.paymentStatus}
                        </span>
                        {schedule.expectedAmount !== undefined
                          ? formatPeso(schedule.expectedAmount)
                          : null}
                      </p>
                    ) : null}
                    {schedule.notes ? (
                      <p className="rounded-lg bg-stone-50 p-3 text-xs leading-5">
                        {schedule.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-stone-200 pt-4">
                    <label className="text-xs font-semibold text-stone-600">
                      Schedule status
                      <select
                        value={schedule.status}
                        disabled={updatingId === schedule.id}
                        onChange={(event) =>
                          void updateSchedule(schedule.id, {
                            status: event.target.value as ScheduleStatus,
                          })
                        }
                        className={`${fieldClass} mt-1 h-9`}
                      >
                        <option>Scheduled</option>
                        <option>Completed</option>
                        <option>Cancelled</option>
                      </select>
                    </label>
                    {schedule.eventType !== "Client meeting" ? (
                      <label className="text-xs font-semibold text-stone-600">
                        Payment status
                        <select
                          value={schedule.paymentStatus}
                          disabled={updatingId === schedule.id}
                          onChange={(event) =>
                            void updateSchedule(schedule.id, {
                              paymentStatus: event.target.value as PaymentStatus,
                            })
                          }
                          className={`${fieldClass} mt-1 h-9`}
                        >
                          <option>Expected</option>
                          <option>Pending</option>
                          <option>Paid</option>
                          <option>Overdue</option>
                        </select>
                      </label>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-stone-200 p-6 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-3 text-sm font-medium text-stone-700">No schedules for this day</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                Add a client meeting or record the next expected payment date.
              </p>
              <Button type="button" size="sm" className="mt-4" onClick={openForm}>
                Add schedule
              </Button>
            </div>
          )}

          <div className="mt-5 border-t border-stone-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Legend</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {(Object.keys(eventTypeClass) as ScheduleEventType[]).map((eventType) => (
                <span key={eventType} className={`rounded border px-2 py-1 ${eventTypeClass[eventType]}`}>
                  {eventType}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
