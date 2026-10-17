"use client";

import { Button } from "@/components/ui/button";
import { formatMaintenanceEnd, formatTimeLeft } from "@/lib/maintenance-mode";
import type { MaintenanceModeStatus } from "@/types/maintenance";
import { Clock3, Power, Wrench } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const field = "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-normal text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";
const durations = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 480, label: "8 hours" },
];

const durationLabel = (minutes: number) =>
  durations.find((option) => option.minutes === minutes)?.label ?? `${minutes / 60} hours`;

export function AdminMaintenanceMode({ onError, onSuccess }: { onError: (message: string | null) => void; onSuccess: (message: string | null) => void }) {
  const [status, setStatus] = useState<MaintenanceModeStatus | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [duration, setDuration] = useState("120");
  const [customHours, setCustomHours] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/mode", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<MaintenanceModeStatus>) : Promise.reject()))
      .then((next) => { if (active) setStatus(next); })
      .catch(() => { if (active) onError("Unable to load the maintenance mode status."); });
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      active = false;
      clearInterval(tick);
    };
  }, [onError]);

  const isActive = Boolean(status?.active && status.endsAt && new Date(status.endsAt) > now);
  const minutes = duration === "custom" ? Math.round(Number(customHours) * 60) : Number(duration);

  const send = async (body: Record<string, unknown>, success: string) => {
    setIsSaving(true);
    onError(null);
    onSuccess(null);
    try {
      const response = await fetch("/api/maintenance/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => ({}))) as MaintenanceModeStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to change maintenance mode.");
      setStatus(payload);
      setNow(new Date());
      onSuccess(success);
    } catch (sendError) {
      onError(sendError instanceof Error ? sendError.message : "Unable to change maintenance mode.");
    } finally {
      setIsSaving(false);
    }
  };

  const start = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 1440) {
      onError("Choose a duration from 15 minutes to 24 hours.");
      return;
    }
    const endsAt = new Date(Date.now() + minutes * 60_000);
    const confirmed = window.confirm(
      `Start maintenance until ${formatMaintenanceEnd(endsAt)}? Customers and the Billing Clerk can't use the system until then.`,
    );
    if (confirmed) void send({ action: "start", minutes, ...(message.trim() ? { message: message.trim() } : {}) }, "Maintenance mode is on.");
  };

  const end = () => {
    if (window.confirm("End maintenance now? Customers and the Billing Clerk can use the system again right away.")) {
      void send({ action: "end" }, "Maintenance mode is off. The system is available again.");
    }
  };

  if (!status) return <div className={`${panel} text-sm text-stone-500`}>Loading maintenance mode…</div>;

  if (isActive && status.endsAt) {
    return (
      <section className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-700 text-white"><Wrench className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Maintenance Mode Is On</h2>
              <p className="mt-1 text-sm text-stone-600">Customers and the Billing Clerk see the System Under Maintenance screen. You can keep working.</p>
            </div>
          </div>
          <Button type="button" disabled={isSaving} onClick={end}><Power className="mr-2 h-4 w-4" aria-hidden="true" />End Now</Button>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-rose-50 p-4">
            <dt className="flex items-center gap-1.5 text-sm text-stone-600"><Clock3 className="h-4 w-4" aria-hidden="true" />Ends at</dt>
            <dd className="mt-1 text-xl font-semibold tracking-tight text-red-700">{formatMaintenanceEnd(status.endsAt, now)}</dd>
            <dd className="text-xs text-stone-500">About {formatTimeLeft(status.endsAt, now)} left</dd>
          </div>
          <div className="rounded-lg bg-stone-50 p-4">
            <dt className="text-sm text-stone-600">Started by</dt>
            <dd className="mt-1 font-semibold">{status.startedByName}</dd>
            {status.startedAt ? <dd className="text-xs text-stone-500">At {formatMaintenanceEnd(status.startedAt, now)}</dd> : null}
          </div>
          <div className="rounded-lg bg-stone-50 p-4">
            <dt className="text-sm text-stone-600">Message to users</dt>
            <dd className="mt-1 text-sm">{status.message || "Default message"}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-stone-700">Need more time?</span>
          {[30, 60].map((extra) => (
            <Button key={extra} type="button" variant="outline" size="sm" disabled={isSaving} onClick={() => void send({ action: "extend", minutes: extra }, `Maintenance was extended by ${durationLabel(extra)}.`)}>
              + {durationLabel(extra)}
            </Button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={start} className={panel}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700"><Wrench className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Maintenance Mode</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            While it is on, customers and the Billing Clerk see a System Under Maintenance screen with the time it ends, and their actions are paused.
            Visitors see a notice on the website. The Admin keeps full access, and maintenance ends by itself at the set time.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-stone-700">
          How Long
          <select className={field} value={duration} onChange={(event) => setDuration(event.target.value)}>
            {durations.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
            <option value="custom">Custom</option>
          </select>
        </label>
        {duration === "custom" ? (
          <label className="block text-sm font-medium text-stone-700">
            Hours
            <input required type="number" min="0.25" max="24" step="0.25" className={field} value={customHours} onChange={(event) => setCustomHours(event.target.value)} placeholder="Example: 1.5" />
          </label>
        ) : null}
        <label className="block text-sm font-medium text-stone-700 md:col-span-2">
          Message to Users (optional)
          <textarea maxLength={300} className={`${field} h-20 py-2`} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="We're upgrading the payment system. Your records are safe." />
        </label>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={isSaving}>{isSaving ? "Starting…" : "Start Maintenance"}</Button>
      </div>
    </form>
  );
}
