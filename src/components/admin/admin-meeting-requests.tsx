"use client";

import { Button } from "@/components/ui/button";
import { formatScheduleDateTime, meetingAboutLabel, readScheduleJson, toDateTimeInput } from "@/lib/schedule-display";
import type { MeetingRequestDto, ScheduleDto } from "@/types/schedules";
import { FolderOpen, Inbox, MapPin, Monitor, Users } from "lucide-react";
import { useState } from "react";

const fieldClass =
  "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

/** Pending customer meeting requests: approve one of their times (or another), or decline with a reason. */
export function AdminMeetingRequests({ requests, onAnswered }: {
  requests: MeetingRequestDto[];
  onAnswered: (request: MeetingRequestDto, schedule?: ScheduleDto) => void;
}) {
  return (
    <section className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><Inbox className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Meeting Requests ({requests.length})</h2>
          <p className="mt-1 text-sm text-stone-600">Clients asked for these meetings. Pick one of their times or set another; they are notified either way.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {requests.map((request) => <MeetingRequestCard key={request.id} request={request} onAnswered={onAnswered} />)}
      </div>
    </section>
  );
}

function MeetingRequestCard({ request, onAnswered }: { request: MeetingRequestDto; onAnswered: (request: MeetingRequestDto, schedule?: ScheduleDto) => void }) {
  const [choice, setChoice] = useState(request.preferredTimes[0]);
  const [otherTime, setOtherTime] = useState(() => toDateTimeInput(new Date(request.preferredTimes[0])));
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [location, setLocation] = useState("");
  const [isDeclining, setIsDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (body: Record<string, unknown>) => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/meeting-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await readScheduleJson<{ request: MeetingRequestDto; schedule?: ScheduleDto }>(response);
      onAnswered(result.request, result.schedule);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to answer the request.");
      setIsSaving(false);
    }
  };

  const approve = () => {
    const scheduledFor = choice === "other" ? new Date(otherTime) : new Date(choice);
    if (Number.isNaN(scheduledFor.getTime())) return setError("Select a valid date and time.");
    void send({ action: "approve", scheduledFor: scheduledFor.toISOString(), durationMinutes: Number(durationMinutes), ...(location.trim() ? { location: location.trim() } : {}) });
  };

  return (
    <article className="rounded-xl border border-stone-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold text-stone-950">{request.topic}</h3>
          <p className="mt-1 flex items-center gap-2 text-sm text-stone-600"><Users className="h-4 w-4 shrink-0" />{request.customerName}</p>
          <p className="mt-1 flex items-start gap-2 text-sm text-stone-600">
            <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-words">Related to: {meetingAboutLabel(request)}</span>
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700">
          {request.mode === "Online" ? <Monitor className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{request.mode}
        </span>
      </div>
      {request.details ? <p className="mt-3 whitespace-pre-line rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-700">{request.details}</p> : null}

      <fieldset className="mt-4 space-y-2" disabled={isSaving}>
        <legend className="text-xs font-semibold uppercase tracking-wide text-stone-500">Meeting Time</legend>
        {request.preferredTimes.map((time, index) => (
          <label key={time} className="flex items-center gap-2 text-sm text-stone-700">
            <input type="radio" name={`time-${request.id}`} checked={choice === time} onChange={() => setChoice(time)} className="accent-red-700" />
            {formatScheduleDateTime(time)}<span className="text-xs text-stone-500">· Choice {index + 1}</span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="radio" name={`time-${request.id}`} checked={choice === "other"} onChange={() => setChoice("other")} className="accent-red-700" />
          Another time
        </label>
        {choice === "other" ? (
          <input type="datetime-local" value={otherTime} onChange={(event) => setOtherTime(event.target.value)} className={fieldClass} aria-label="Another meeting time" />
        ) : null}
      </fieldset>

      <div className="mt-3 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <label className="text-xs font-semibold text-stone-600">
          Duration
          <select value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} className={fieldClass} disabled={isSaving}>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="90">1 hour 30 minutes</option>
            <option value="120">2 hours</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-stone-600">
          {request.mode === "Online" ? "Meeting link" : "Location"} (optional)
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder={request.mode === "Online" ? "Enter video-call link" : "Enter location"}
            className={fieldClass}
            disabled={isSaving}
          />
        </label>
      </div>

      {isDeclining ? (
        <label className="mt-3 block text-xs font-semibold text-stone-600">
          Reason for the client
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Enter reason for the client"
            className="mt-1.5 min-h-20 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
            disabled={isSaving}
          />
        </label>
      ) : null}

      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {isDeclining ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsDeclining(false)} disabled={isSaving}>Back</Button>
            <Button type="button" size="sm" onClick={() => void send({ action: "decline", reason })} disabled={isSaving || reason.trim().length < 3}>
              {isSaving ? "Sending…" : "Decline Request"}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsDeclining(true)} disabled={isSaving}>Decline</Button>
            <Button type="button" size="sm" onClick={approve} disabled={isSaving}>{isSaving ? "Saving…" : "Approve and Schedule"}</Button>
          </>
        )}
      </div>
    </article>
  );
}
