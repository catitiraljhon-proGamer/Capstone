"use client";

import { AdminMaintenanceProfessionals } from "@/components/admin/admin-maintenance-professionals";
import { aboutUsServiceIcons } from "@/components/landing/about-us-services";
import { Button } from "@/components/ui/button";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { aboutUsLimits, type AboutUsContent, type AboutUsView } from "@/lib/about-us";
import { useEffect, useState } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const inputClass =
  "mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

function changedLine(view: AboutUsView) {
  if (!view.changedBy || !view.changedAt) return null;
  const date = new Date(view.changedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  return `Last changed by ${view.changedBy} · ${date}`;
}

/** The first empty field as a message and the id of its input, so saving can point at it. */
function firstProblem(content: AboutUsContent): { message: string; fieldId: string } | null {
  if (!content.tagline.trim()) return { message: "Enter the tagline.", fieldId: "about-tagline" };
  if (!content.intro.trim()) return { message: "Write the introduction.", fieldId: "about-intro" };
  for (const [index, service] of content.services.entries()) {
    if (!service.title.trim()) return { message: `Enter a title for What We Do item ${index + 1}.`, fieldId: `about-service-${index}-title` };
    if (!service.text.trim()) return { message: `Describe What We Do item ${index + 1}.`, fieldId: `about-service-${index}-text` };
  }
  return null;
}

/** Maintenance > About Us: the page text, then the architects and engineers listed on it. */
export function AdminMaintenanceAboutUs({ onError, onSuccess }: {
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [view, setView] = useState<AboutUsView | null>(null);
  const [draft, setDraft] = useState<AboutUsContent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/about-us", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as AboutUsView & { error?: string };
        if (!response.ok || !payload.content) throw new Error(payload.error ?? "Unable to load the About Us text.");
        if (!active) return;
        setView(payload);
        setDraft(payload.content);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        onError(loadError instanceof Error ? loadError.message : "Unable to load the About Us text.");
      });
    return () => {
      active = false;
    };
  }, [onError]);

  const changed = Boolean(view && draft && JSON.stringify(draft) !== JSON.stringify(view.content));

  const update = (next: AboutUsContent) => {
    setDraft(next);
    onSuccess(null);
  };

  const updateService = (index: number, field: "title" | "text", value: string) => {
    if (!draft) return;
    update({ ...draft, services: draft.services.map((service, position) => (position === index ? { ...service, [field]: value } : service)) });
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
      const response = await fetch("/api/maintenance/about-us", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json().catch(() => ({}))) as AboutUsView & { error?: string; issues?: { message?: string }[] };
      if (!response.ok || !payload.content) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to save the About Us text.");
      setView(payload);
      setDraft(payload.content);
      onSuccess("About Us text saved. The About Us page shows it now.");
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "Unable to save the About Us text.");
    } finally {
      setIsSaving(false);
    }
  };

  const lastChange = view ? changedLine(view) : null;

  return (
    <div className="space-y-5">
      {!view || !draft ? (
        <div className={`${panel} text-sm text-stone-500`}>{loadFailed ? "The About Us text is unavailable." : "Loading the About Us text…"}</div>
      ) : (
        <>
          <section className={panel}>
            <h2 className="text-base font-semibold tracking-tight">About Us Page Text</h2>
            <p className="mt-1 text-sm text-stone-600">
              The text visitors read on the About Us page. The page title, About G4 Builders Incorporated, stays the same.
            </p>
            {lastChange ? <p className="mt-2 text-xs text-stone-500">{lastChange}</p> : null}

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="about-tagline" className="text-sm font-medium text-stone-950">
                  Tagline <RequiredIndicator />
                </label>
                <p className="text-xs text-stone-500">The short red line above the page title.</p>
                <input
                  id="about-tagline"
                  value={draft.tagline}
                  maxLength={aboutUsLimits.tagline}
                  onChange={(event) => update({ ...draft, tagline: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="about-intro" className="text-sm font-medium text-stone-950">
                  Introduction <RequiredIndicator />
                </label>
                <textarea
                  id="about-intro"
                  rows={4}
                  value={draft.intro}
                  maxLength={aboutUsLimits.intro}
                  onChange={(event) => update({ ...draft, intro: event.target.value })}
                  aria-describedby="about-intro-count"
                  className={`resize-y ${inputClass}`}
                />
                <p id="about-intro-count" className="mt-1 text-right text-xs text-stone-500">
                  {draft.intro.length} of {aboutUsLimits.intro.toLocaleString("en-PH")} characters
                </p>
              </div>
            </div>
          </section>

          <section className={panel}>
            <h2 className="text-base font-semibold tracking-tight">What We Do</h2>
            <p className="mt-1 text-sm text-stone-600">The four services listed on the page. Each keeps its icon.</p>
            <ol className="mt-4 grid gap-4 xl:grid-cols-2">
              {draft.services.map((service, index) => {
                const Icon = aboutUsServiceIcons[index];
                return (
                  <li key={index} className="rounded-lg border border-stone-200 p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-50 text-red-700">
                        <Icon aria-hidden="true" className="h-4 w-4" />
                      </span>
                      Item {index + 1}
                    </p>
                    <label htmlFor={`about-service-${index}-title`} className="mt-3 block text-sm font-medium text-stone-950">
                      Title <RequiredIndicator />
                    </label>
                    <input
                      id={`about-service-${index}-title`}
                      value={service.title}
                      maxLength={aboutUsLimits.serviceTitle}
                      onChange={(event) => updateService(index, "title", event.target.value)}
                      className={inputClass}
                    />
                    <label htmlFor={`about-service-${index}-text`} className="mt-3 block text-sm font-medium text-stone-950">
                      Description <RequiredIndicator />
                    </label>
                    <textarea
                      id={`about-service-${index}-text`}
                      rows={3}
                      value={service.text}
                      maxLength={aboutUsLimits.serviceText}
                      onChange={(event) => updateService(index, "text", event.target.value)}
                      className={`resize-y ${inputClass}`}
                    />
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}

      <AdminMaintenanceProfessionals onError={onError} onSuccess={onSuccess} />

      {changed && view ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mr-auto text-sm text-stone-600" role="status">Unsaved changes to the About Us text</p>
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => { setDraft(view.content); onError(null); }}>
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
