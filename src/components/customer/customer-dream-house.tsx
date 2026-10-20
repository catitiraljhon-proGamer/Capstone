"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HardHat, RefreshCw } from "lucide-react";
import { BillingErrorMessage, billingJson } from "@/components/billing/billing-primitives";
import { ConstructionEstimateCard } from "@/components/customer/construction-estimate-card";
import { ConstructionProjectCard } from "@/components/customer/construction-project-card";
import { DreamHouseConstructionSection } from "@/components/customer/dream-house-construction";
import { DreamHouseDesignReview } from "@/components/customer/dream-house-design-review";
import { DreamHouseDesignSection } from "@/components/customer/dream-house-design-section";
import { canRequestEstimate, dreamHouseName, isDreamHouse, journeyProgress, journeyStages, JourneyStepper, nextStep } from "@/components/customer/dream-house-journey";
import { DreamHouseNextStep } from "@/components/customer/dream-house-next-step";
import { Button } from "@/components/ui/button";
import type { ConstructionProjectDto, CostEstimateDto } from "@/types/construction";
import type { DesignRequestDto } from "@/types/design-requests";

type DreamHouseData = {
  designs: DesignRequestDto[];
  estimates: CostEstimateDto[];
  projects: ConstructionProjectDto[];
};

async function fetchJson<T>(url: string, signal?: AbortSignal) {
  return billingJson<T>(await fetch(url, { cache: "no-store", signal }));
}

function DreamHouseCard({ design, estimate, project, highlighted, starting, onStart, onCancelStart, onSubmitted, onChanged }: {
  design: DesignRequestDto;
  estimate?: CostEstimateDto;
  project?: ConstructionProjectDto;
  highlighted: boolean;
  starting: boolean;
  onStart: () => void;
  onCancelStart: () => void;
  onSubmitted: (estimate: CostEstimateDto) => void;
  onChanged: (message?: string) => void;
}) {
  const specs = [`${design.floorArea.toLocaleString("en-PH")} sqm`, design.rooms, design.finish ? `${design.finish} finish` : null].filter(Boolean).join(" · ");
  return (
    <article id={`dream-${design.id}`} className={`scroll-mt-28 overflow-hidden rounded-xl border bg-white shadow-sm ${highlighted ? "border-red-300 ring-2 ring-red-600/20" : "border-stone-200"}`}>
      <div className="space-y-5 border-b border-stone-200 bg-stone-50 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold tracking-tight">{dreamHouseName(design)}</h2>
          <p className="mt-1 break-words text-sm text-stone-600">{specs}</p>
          <p className="mt-1 text-xs text-stone-400">Request {design.id.slice(-8).toUpperCase()}</p>
        </div>
        <JourneyStepper stages={journeyStages(design)} current={journeyProgress(design, estimate, project)} />
        <DreamHouseNextStep step={nextStep(design, estimate, project)} />
      </div>
      <div className="divide-y divide-stone-200">
        {design.workflow === "blueprint"
          ? <DreamHouseDesignReview design={design} collapseBlueprint={Boolean(estimate)} onChanged={onChanged} />
          : <DreamHouseDesignSection design={design} />}
        <DreamHouseConstructionSection
          design={design} estimate={estimate} project={project} starting={starting}
          onStart={onStart} onCancelStart={onCancelStart} onSubmitted={onSubmitted} onChanged={onChanged}
        />
      </div>
    </article>
  );
}

export function CustomerDreamHouse({ designId, designRequestId, estimateId }: { designId?: string; designRequestId?: string; estimateId?: string }) {
  const [data, setData] = useState<DreamHouseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(designRequestId ?? null);
  const scrolledTo = useRef<string | null>(null);

  const load = useCallback((signal?: AbortSignal) =>
    Promise.all([
      fetchJson<{ requests: DesignRequestDto[] }>("/api/design-requests", signal),
      fetchJson<{ estimates: CostEstimateDto[] }>("/api/construction/estimates", signal),
      fetchJson<{ projects: ConstructionProjectDto[] }>("/api/construction/projects", signal),
    ])
      .then(([designs, estimates, projects]) => {
        if (signal?.aborted) return;
        setData({ designs: designs.requests, estimates: estimates.estimates, projects: projects.projects });
        setError(null);
      })
      .catch((failure: unknown) => {
        if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Unable to load your dream house details.");
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); }), []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const onFocus = () => { void load(controller.signal); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const { designs, waitingForReview, estimates, orphanEstimates, orphanProjects } = useMemo(() => {
    const allDesigns = data?.designs ?? [];
    const allEstimates = data?.estimates ?? [];
    const allProjects = data?.projects ?? [];
    const designIds = new Set(allDesigns.map((design) => design.id));
    const owned = allEstimates.filter((estimate) => estimate.designRequestId && designIds.has(estimate.designRequestId));
    const ownedIds = new Set(owned.map((estimate) => estimate.id));
    return {
      designs: allDesigns.filter(isDreamHouse),
      waitingForReview: allDesigns.filter((design) => design.status === "Pending" || design.status === "In review").length,
      estimates: owned,
      orphanEstimates: allEstimates.filter((estimate) => !ownedIds.has(estimate.id)),
      orphanProjects: allProjects.filter((project) => !project.estimateId || !ownedIds.has(project.estimateId)),
    };
  }, [data]);
  const projects = data?.projects ?? [];
  const estimateFor = (id: string) => estimates.find((estimate) => estimate.designRequestId === id);
  const projectFor = (estimate?: CostEstimateDto) => (estimate ? projects.find((project) => project.estimateId === estimate.id) : undefined);

  const focusDesignId = useMemo(() => {
    if (!data) return null;
    const viaEstimate = estimateId ? estimates.find((estimate) => estimate.id === estimateId)?.designRequestId : null;
    const wanted = viaEstimate ?? designRequestId ?? designId ?? null;
    return wanted && designs.some((design) => design.id === wanted) ? wanted : null;
  }, [data, designs, estimates, estimateId, designRequestId, designId]);
  const focusOrphanEstimateId = !focusDesignId && estimateId && orphanEstimates.some((estimate) => estimate.id === estimateId) ? estimateId : null;
  const scrollTarget = focusDesignId ? `dream-${focusDesignId}` : focusOrphanEstimateId ? `estimate-${focusOrphanEstimateId}` : null;

  useEffect(() => {
    if (!scrollTarget || scrolledTo.current === scrollTarget) return;
    document.getElementById(scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrolledTo.current = scrollTarget;
  }, [scrollTarget]);

  const requested = designRequestId ? designs.find((design) => design.id === designRequestId) : undefined;
  const designNotEligible = Boolean(data && designRequestId && (!requested || (!canRequestEstimate(requested) && !estimateFor(requested.id))));

  const refresh = (message?: string) => {
    if (message) setNotice(message);
    void load();
  };

  const hasOther = orphanEstimates.length > 0 || orphanProjects.length > 0;
  const nothingYet = Boolean(data) && !designs.length && !hasOther && !waitingForReview;

  return (
    <div className="min-w-0 space-y-6">
      <section className="rounded-xl bg-gradient-to-r from-red-950 to-red-800 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-rose-200">From design to construction</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Dream House</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-rose-100">
          Review your design and floor plan for free and request changes until it is right. Once you approve it, pay for the blueprint, then download it or pick up a printed copy at our office. If you want us to build it, proceed to construction for a free cost estimate and pay by stage as the house goes up.
        </p>
        <Button asChild variant="outline" className="mt-5 min-h-11"><Link href="/customer/design-requests">New Design Request</Link></Button>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">Only designs, estimates, and projects that belong to you appear here.</p>
        <Button variant="outline" disabled={loading} onClick={() => { setLoading(true); void load(); }}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <BillingErrorMessage message={error} />
      {notice && <p role="status" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-red-900">{notice}</p>}
      {loading && !data && <p role="status" className="text-sm text-stone-500">Loading your dream house…</p>}
      {designNotEligible && (
        <p role="status" className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
          That design is not available for construction yet. Construction opens after your blueprint fee is fully paid.
        </p>
      )}

      {waitingForReview > 0 && (
        <p role="status" className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
          {waitingForReview === 1 ? "1 design request is" : `${waitingForReview} design requests are`} waiting for G4 Builders to review. It appears here once approved.{" "}
          <Link href="/customer/design-requests" className="font-semibold text-red-700 hover:underline">View in Design Requests</Link>
        </p>
      )}

      {nothingYet && (
        <section className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center sm:p-10">
          <HardHat className="mx-auto h-10 w-10 text-stone-400" />
          <h2 className="mt-4 text-lg font-semibold">No Dream House Yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-600">
            Your journey starts with a design. Explore finished designs for inspiration, or send your own requirements in Design Requests. Once you approve your design and pay for the blueprint, you can download it, pick up a printed copy, or ask G4 Builders to build it.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild variant="outline" className="min-h-11"><Link href="/customer/finished-designs">Explore Finished Designs</Link></Button>
            <Button asChild className="min-h-11"><Link href="/customer/design-requests">Go to Design Requests</Link></Button>
          </div>
        </section>
      )}

      <div className="space-y-6">
        {designs.map((design) => {
          const estimate = estimateFor(design.id);
          return (
            <DreamHouseCard
              key={design.id} design={design} estimate={estimate} project={projectFor(estimate)}
              highlighted={design.id === focusDesignId}
              starting={startingId === design.id && canRequestEstimate(design) && !estimate}
              onStart={() => { setNotice(null); setStartingId(design.id); }}
              onCancelStart={() => setStartingId(null)}
              onSubmitted={(submitted) => {
                setStartingId(null);
                setNotice(`Construction request sent. G4 Builders will prepare estimate ${submitted.reference} for your review.`);
                void load();
              }}
              onChanged={refresh}
            />
          );
        })}
      </div>

      {hasOther && (
        <section aria-labelledby="other-projects-heading" className="space-y-4">
          <div>
            <h2 id="other-projects-heading" className="text-lg font-semibold tracking-tight">Other Projects</h2>
            <p className="mt-1 text-sm text-stone-600">Estimates and projects set up directly with G4 Builders, without a design request in this portal.</p>
          </div>
          {orphanEstimates.map((estimate) => (
            <ConstructionEstimateCard key={estimate.id} estimate={estimate} highlighted={estimate.id === focusOrphanEstimateId} onChanged={refresh} />
          ))}
          {orphanProjects.map((project) => <ConstructionProjectCard key={project.id} project={project} />)}
        </section>
      )}
    </div>
  );
}

