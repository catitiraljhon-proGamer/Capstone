"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, Plus, Trash2 } from "lucide-react";
import { BillingErrorMessage, billingJson } from "@/components/billing/billing-primitives";
import { constructionFieldClass } from "@/components/customer/construction-shared";
import { Button } from "@/components/ui/button";
import { manilaDay } from "@/lib/form-validation";
import { formatSlot, manilaDateTime, officeHoursText, officeTimeSlots } from "@/lib/office-hours";
import { formatScheduleDateTime } from "@/lib/schedule-display";
import type { DesignRequestDto } from "@/types/design-requests";

type Choice = { date: string; slot: string };

const day = 86_400_000;

/** Office slots on a date that are still at least a day away, as the server requires. */
function openSlots(date: string, now: number) {
  if (!date) return [];
  const earliest = now + day;
  return officeTimeSlots(date).filter((slot) => new Date(manilaDateTime(date, slot)).getTime() >= earliest);
}

/** Lets the customer pick up the printed blueprint at the office; the admin confirms the time. */
export function BlueprintPickup({ design, onChanged }: { design: DesignRequestDto; onChanged: (message?: string) => void }) {
  const pickup = design.pickup;
  const [choices, setChoices] = useState<Choice[]>([{ date: "", slot: "" }]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read the clock once per mount; the server re-checks every time anyway.
  const [now] = useState(() => Date.now());
  const minDate = manilaDay(1);
  const maxDate = manilaDay(90);
  const upcoming = pickup?.status === "Approved" && pickup.scheduledFor && new Date(pickup.scheduledFor).getTime() > now;

  const setChoice = (index: number, change: Partial<Choice>) =>
    setChoices((current) => current.map((choice, position) => (position === index ? { ...choice, ...change } : choice)));

  const submit = async () => {
    const picked = choices.filter((choice) => choice.date && choice.slot);
    if (!picked.length || picked.length !== choices.length) {
      setError("Choose a date and an office time for each choice.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await billingJson(await fetch(`/api/design-requests/${design.id}/pickup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredTimes: picked.map((choice) => manilaDateTime(choice.date, choice.slot)),
          ...(details.trim() ? { details: details.trim() } : {}),
        }),
      }));
      setChoices([{ date: "", slot: "" }]);
      setDetails("");
      onChanged("Pickup request sent. The admin will confirm a time and notify you.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to send your pickup request.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!pickup) return;
    setBusy(true);
    setError(null);
    try {
      await billingJson(await fetch(`/api/meeting-requests/${pickup.requestId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }),
      }));
      onChanged("Pickup request cancelled. You can choose new times.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to cancel your pickup request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-stone-200 pt-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-red-700" />
        <p className="text-sm font-semibold text-stone-950">Pick Up the Printed Blueprint</p>
      </div>
      <BillingErrorMessage message={error} />

      {upcoming ? (
        <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-4 text-sm leading-6 text-red-900">
          <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            Pickup scheduled for <strong>{formatScheduleDateTime(pickup.scheduledFor!)}</strong> at the G4 Builders Inc office.
            It is also in <Link href="/customer/schedule" className="font-semibold underline">My Schedule</Link>.
          </span>
        </p>
      ) : pickup?.status === "Pending" ? (
        <div className="space-y-3 rounded-lg bg-stone-50 p-4 text-sm leading-6 text-stone-700">
          <p>Waiting for the admin to confirm one of your times:</p>
          <ul className="list-disc space-y-1 pl-5">
            {pickup.preferredTimes.map((time) => <li key={time}>{formatScheduleDateTime(time)}</li>)}
          </ul>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel Request"}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-stone-600">
            {pickup?.status === "Approved"
              ? "Your last pickup date has passed. Choose new times if you still need the printed copy."
              : "You can also get the printed blueprint at our office. Give up to three times that work for you, and the admin confirms one."}
          </p>
          {pickup?.status === "Declined" && pickup.declineReason && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Your last request was declined: {pickup.declineReason}</p>
          )}
          <p className="text-xs text-stone-500">Office hours: {officeHoursText}. Closed on Sunday.</p>
          <div className="space-y-3">
            {choices.map((choice, index) => {
              const slots = openSlots(choice.date, now);
              return (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <label className="min-w-0 text-xs font-semibold text-stone-600">
                    Choice {index + 1} · Date
                    <input
                      type="date" min={minDate} max={maxDate} value={choice.date} disabled={busy}
                      onChange={(event) => setChoice(index, { date: event.target.value, slot: "" })}
                      className={constructionFieldClass}
                    />
                  </label>
                  <label className="min-w-0 text-xs font-semibold text-stone-600">
                    Time
                    <select
                      value={choice.slot} disabled={busy || !choice.date || !slots.length}
                      onChange={(event) => setChoice(index, { slot: event.target.value })}
                      className={constructionFieldClass}
                    >
                      <option value="">{!choice.date ? "Choose a date first" : slots.length ? "Select a time" : "Office closed this day"}</option>
                      {slots.map((slot) => <option key={slot} value={slot}>{formatSlot(slot)}</option>)}
                    </select>
                  </label>
                  {choices.length > 1 ? (
                    <button
                      type="button" disabled={busy}
                      onClick={() => setChoices((current) => current.filter((_, position) => position !== index))}
                      className="grid h-10 w-10 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"
                      aria-label={`Remove choice ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {choices.length < 3 ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setChoices((current) => [...current, { date: "", slot: "" }])}>
              <Plus className="mr-2 h-3.5 w-3.5" />Add Another Time
            </Button>
          ) : null}
          <label className="block text-xs font-semibold text-stone-600">
            Note for the admin (optional)
            <input
              maxLength={500} value={details} disabled={busy} onChange={(event) => setDetails(event.target.value)}
              placeholder="Enter note for the admin"
              className={constructionFieldClass}
            />
          </label>
          <Button disabled={busy} onClick={() => void submit()}>{busy ? "Sending…" : "Request Pickup"}</Button>
        </div>
      )}
    </div>
  );
}
