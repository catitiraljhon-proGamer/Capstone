"use client";

import { Button } from "@/components/ui/button";
import { warrantyLimits, type WarrantyLists, type WarrantyListsView } from "@/lib/warranty";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";
const iconButton = "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40";

function changedLine(view: WarrantyListsView) {
  if (!view.changedBy || !view.changedAt) return null;
  const date = new Date(view.changedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  return `Last changed by ${view.changedBy} · ${date}`;
}

const lower = (value: string) => value.trim().toLowerCase();

/** The first problem with the lists as a message and the id of the field to fix, so saving can point at it. */
function firstProblem(lists: WarrantyLists): { message: string; fieldId: string } | null {
  for (const [index, type] of lists.problemTypes.entries()) {
    if (type.name.trim().length < 2) return { message: `Enter a name for problem type ${index + 1}.`, fieldId: `warranty-type-${index}` };
    if (lists.problemTypes.findIndex((other) => lower(other.name) === lower(type.name)) !== index) {
      return { message: `"${type.name.trim()}" is listed twice. Give each problem type a different name.`, fieldId: `warranty-type-${index}` };
    }
  }
  if (!lists.problemTypes.some((type) => type.shown)) return { message: "Show at least one problem type, so customers can report a problem.", fieldId: "warranty-type-0" };
  for (const [index, reason] of lists.notCoveredReasons.entries()) {
    if (reason.trim().length < 5) return { message: `Write not-covered reason ${index + 1} in a few words.`, fieldId: `warranty-reason-${index}` };
    if (lists.notCoveredReasons.findIndex((other) => lower(other) === lower(reason)) !== index) {
      return { message: `"${reason.trim()}" is listed twice.`, fieldId: `warranty-reason-${index}` };
    }
  }
  return null;
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Maintenance > Warranty: the problem types customers choose from and the reasons a problem may not be covered. */
export function AdminMaintenanceWarranty({ onError, onSuccess }: {
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [view, setView] = useState<WarrantyListsView | null>(null);
  const [draft, setDraft] = useState<WarrantyLists | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/warranty", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as WarrantyListsView & { error?: string };
        if (!response.ok || !payload.problemTypes) throw new Error(payload.error ?? "Unable to load the warranty lists.");
        if (!active) return;
        setView(payload);
        setDraft({ problemTypes: payload.problemTypes, notCoveredReasons: payload.notCoveredReasons });
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        onError(loadError instanceof Error ? loadError.message : "Unable to load the warranty lists.");
      });
    return () => {
      active = false;
    };
  }, [onError]);

  const saved = view ? { problemTypes: view.problemTypes, notCoveredReasons: view.notCoveredReasons } : null;
  const changed = Boolean(saved && draft && JSON.stringify(draft) !== JSON.stringify(saved));

  const update = (next: WarrantyLists) => {
    setDraft(next);
    onSuccess(null);
  };

  const save = async () => {
    if (!draft) return;
    onError(null);
    onSuccess(null);
    const problem = firstProblem(draft);
    if (problem) {
      onError(problem.message);
      document.getElementById(problem.fieldId)?.focus();
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/maintenance/warranty", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemTypes: draft.problemTypes.map((type) => ({ name: type.name.trim(), shown: type.shown })),
          notCoveredReasons: draft.notCoveredReasons.map((reason) => reason.trim()),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as WarrantyListsView & { error?: string; issues?: { message?: string }[] };
      if (!response.ok || !payload.problemTypes) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to save the warranty lists.");
      setView(payload);
      setDraft({ problemTypes: payload.problemTypes, notCoveredReasons: payload.notCoveredReasons });
      onSuccess("Warranty lists saved. Report a Problem and the Warranty Certificate use them now.");
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "Unable to save the warranty lists.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!draft || !view) {
    return <div className={`${panel} text-sm text-stone-500`}>{loadFailed ? "The warranty lists are unavailable." : "Loading the warranty lists…"}</div>;
  }

  const types = draft.problemTypes;
  const reasons = draft.notCoveredReasons;
  const lastChange = changedLine(view);

  return (
    <div className="space-y-5">
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Problem Types</h2>
            <p className="mt-1 text-sm text-stone-600">The choices in Report a Problem, in this order. Old claims keep the name they were filed under.</p>
            {lastChange ? <p className="mt-1 text-xs text-stone-500">{lastChange}</p> : null}
          </div>
          <Button
            type="button" variant="outline" disabled={isSaving || types.length >= warrantyLimits.problemTypes}
            onClick={() => update({ ...draft, problemTypes: [...types, { name: "", shown: true }] })}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Add Problem Type
          </Button>
        </div>
        <ol className="mt-4 divide-y divide-stone-200 border-t border-stone-200">
          {types.map((type, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="w-6 shrink-0 text-sm text-stone-500">{index + 1}</span>
              <label htmlFor={`warranty-type-${index}`} className="sr-only">Problem type {index + 1} name</label>
              <input
                id={`warranty-type-${index}`} value={type.name} maxLength={warrantyLimits.problemTypeName} placeholder="Enter problem type" disabled={isSaving}
                onChange={(event) => update({ ...draft, problemTypes: types.map((item, position) => (position === index ? { ...item, name: event.target.value } : item)) })}
                className={`${inputClass} min-w-[14rem] flex-1`}
              />
              <label className="flex min-h-9 shrink-0 cursor-pointer items-center gap-2 px-1 text-sm text-stone-700">
                <input
                  type="checkbox" checked={type.shown} disabled={isSaving}
                  onChange={(event) => update({ ...draft, problemTypes: types.map((item, position) => (position === index ? { ...item, shown: event.target.checked } : item)) })}
                  className="h-4 w-4 accent-red-700"
                />
                Shown
              </label>
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label={`Move problem type ${index + 1} up`} disabled={isSaving || index === 0} onClick={() => update({ ...draft, problemTypes: move(types, index, index - 1) })} className={iconButton}>
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Move problem type ${index + 1} down`} disabled={isSaving || index === types.length - 1} onClick={() => update({ ...draft, problemTypes: move(types, index, index + 1) })} className={iconButton}>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Remove problem type ${index + 1}`} disabled={isSaving || types.length === 1} onClick={() => update({ ...draft, problemTypes: types.filter((_, position) => position !== index) })} className={`${iconButton} text-red-700`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-stone-500">Untick Shown to stop offering a type without removing it. The certificate lists the shown types, except Other, as what the warranty covers.</p>
      </section>

      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Not Covered Reasons</h2>
            <p className="mt-1 text-sm text-stone-600">Picked by the Admin when an inspection finds a problem isn&apos;t covered. They&apos;re also printed on the Warranty Certificate.</p>
          </div>
          <Button
            type="button" variant="outline" disabled={isSaving || reasons.length >= warrantyLimits.notCoveredReasons}
            onClick={() => update({ ...draft, notCoveredReasons: [...reasons, ""] })}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Add Reason
          </Button>
        </div>
        <ol className="mt-4 grid gap-2.5 lg:grid-cols-2">
          {reasons.map((reason, index) => (
            <li key={index} className="flex items-center gap-2">
              <label htmlFor={`warranty-reason-${index}`} className="sr-only">Not covered reason {index + 1}</label>
              <input
                id={`warranty-reason-${index}`} value={reason} maxLength={warrantyLimits.notCoveredReason} placeholder="Enter reason" disabled={isSaving}
                onChange={(event) => update({ ...draft, notCoveredReasons: reasons.map((item, position) => (position === index ? event.target.value : item)) })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button type="button" aria-label={`Remove not covered reason ${index + 1}`} disabled={isSaving || reasons.length === 1} onClick={() => update({ ...draft, notCoveredReasons: reasons.filter((_, position) => position !== index) })} className={`${iconButton} text-red-700`}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </section>

      {changed && saved ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mr-auto text-sm text-stone-600" role="status">Unsaved changes to the warranty lists</p>
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => { setDraft(saved); onError(null); }}>
            Discard
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void save()}>
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
