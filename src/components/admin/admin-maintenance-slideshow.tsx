"use client";

import { Button } from "@/components/ui/button";
import { homeSlideshowLimit, type HomeSlide, type HomeSlideshowView } from "@/lib/home-slideshow";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";

function changedLine(view: HomeSlideshowView) {
  if (!view.changedBy || !view.changedAt) return null;
  const date = new Date(view.changedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  return `Last changed by ${view.changedBy} · ${date}`;
}

function move(ids: string[], index: number, offset: number) {
  const next = [...ids];
  const [id] = next.splice(index, 1);
  next.splice(index + offset, 0, id);
  return next;
}

/** The cover photo as a small background image, like the home page shows it. */
function Thumbnail({ slide, className = "w-24" }: { slide: HomeSlide; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block aspect-[1.42/1] shrink-0 rounded-lg bg-stone-100 bg-cover bg-center ring-1 ring-stone-200 ${className}`}
      style={{ backgroundImage: `url(${slide.image})` }}
    />
  );
}

export function AdminMaintenanceSlideshow({ onError, onSuccess }: {
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [view, setView] = useState<HomeSlideshowView | null>(null);
  /** The picked design ids, in order. */
  const [draft, setDraft] = useState<string[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/home-slideshow", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as HomeSlideshowView & { error?: string };
        if (!response.ok || !payload.designs) throw new Error(payload.error ?? "Unable to load the slideshow.");
        if (!active) return;
        setView(payload);
        setDraft(payload.chosen);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        onError(loadError instanceof Error ? loadError.message : "Unable to load the slideshow.");
      });
    return () => {
      active = false;
    };
  }, [onError]);

  if (!view || !draft) {
    return <div className={`${panel} text-sm text-stone-500`}>{loadFailed ? "The slideshow is unavailable." : "Loading the slideshow…"}</div>;
  }

  const byId = new Map(view.designs.map((slide) => [slide.designId, slide]));
  const chosen = draft.flatMap((id) => byId.get(id) ?? []);
  const changed = draft.join() !== view.chosen.join();
  const isFull = draft.length >= homeSlideshowLimit;
  const lastChange = changedLine(view);

  const update = (next: string[]) => {
    setDraft(next);
    onSuccess(null);
  };

  const save = async () => {
    onError(null);
    onSuccess(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/maintenance/home-slideshow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designIds: draft }),
      });
      const payload = (await response.json().catch(() => ({}))) as HomeSlideshowView & { error?: string; issues?: { message?: string }[] };
      if (!response.ok || !payload.designs) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to save the slideshow.");
      setView(payload);
      setDraft(payload.chosen);
      onSuccess(payload.chosen.length
        ? "Slideshow saved. The home page now shows the designs you chose, in this order."
        : "Slideshow saved. The home page now shows the newest published designs.");
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "Unable to save the slideshow.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className={panel}>
        <h2 className="text-base font-semibold tracking-tight">Home Page Slideshow</h2>
        <p className="mt-1 text-sm text-stone-600">
          Choose up to {homeSlideshowLimit} published house designs for the slideshow on the home page, in the order they
          appear. Each design shows its cover photo, and the slideshow moves to the next one every 3 seconds.
        </p>
        {lastChange ? <p className="mt-2 text-xs text-stone-500">{lastChange}</p> : null}
      </section>

      <section className={panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">On the Home Page</h2>
          <p className="text-sm text-stone-500">{draft.length} of {homeSlideshowLimit} chosen</p>
        </div>
        {chosen.length ? (
          <ol className="mt-3 divide-y divide-stone-200 border-t border-stone-200">
            {chosen.map((slide, index) => (
              <li key={slide.designId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-700 text-xs font-semibold text-white">{index + 1}</span>
                <Thumbnail slide={slide} className="w-20 sm:w-24" />
                {/* On a phone the buttons move to their own line so the name stays readable. */}
                <p className="line-clamp-2 min-w-32 flex-1 break-words text-sm font-medium text-stone-950">{slide.name}</p>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => update(move(draft, index, -1))} aria-label={`Move ${slide.name} up`}>
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={index === chosen.length - 1} onClick={() => update(move(draft, index, 1))} aria-label={`Move ${slide.name} down`}>
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => update(draft.filter((id) => id !== slide.designId))} aria-label={`Remove ${slide.name} from the slideshow`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            None chosen. The home page shows the {homeSlideshowLimit} newest published designs.
          </p>
        )}
      </section>

      <section className={panel}>
        <h2 className="text-base font-semibold tracking-tight">Published Designs</h2>
        <p className="mt-1 text-sm text-stone-600">
          Only published designs with a photo are listed. A design you unpublish leaves the slideshow by itself.
        </p>
        {view.designs.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {view.designs.map((slide) => {
              const added = draft.includes(slide.designId);
              return (
                <li key={slide.designId} className="flex flex-col gap-3 rounded-lg border border-stone-200 p-3">
                  <Thumbnail slide={slide} className="w-full" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-2 min-w-0 break-words text-sm font-medium text-stone-950">{slide.name}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={added || isFull}
                      onClick={() => update([...draft, slide.designId])}
                      aria-label={added ? `${slide.name} is in the slideshow` : `Add ${slide.name} to the slideshow`}
                    >
                      {added ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                      {added ? "Added" : "Add"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            No published designs yet. Publish a design in House Design first.
          </p>
        )}
        {isFull ? <p className="mt-3 text-sm text-stone-600">The slideshow is full. Remove a design to add another.</p> : null}
      </section>

      {changed ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mr-auto text-sm text-stone-600" role="status">Unsaved changes to the slideshow</p>
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => { setDraft(view.chosen); onError(null); }}>
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
