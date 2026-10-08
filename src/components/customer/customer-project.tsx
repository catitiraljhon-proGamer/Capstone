"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HardHat, RefreshCw } from "lucide-react";
import { BillingErrorMessage, BillingPanel, billingJson } from "@/components/billing/billing-primitives";
import { ConstructionEstimateCard } from "@/components/customer/construction-estimate-card";
import { ConstructionProjectCard } from "@/components/customer/construction-project-card";
import { ConstructionRequestForm, designTitle } from "@/components/customer/construction-request-form";
import { Eyebrow } from "@/components/customer/construction-shared";
import { Button } from "@/components/ui/button";
import type { ConstructionProjectDto, CostEstimateDto } from "@/types/construction";
import type { DesignRequestDto } from "@/types/design-requests";

type ProjectData = {
  designs: DesignRequestDto[];
  estimates: CostEstimateDto[];
  projects: ConstructionProjectDto[];
};

async function fetchJson<T>(url: string, signal?: AbortSignal) {
  return billingJson<T>(await fetch(url, { cache: "no-store", signal }));
}

export function CustomerProject({ designRequestId, estimateId }: { designRequestId?: string; estimateId?: string }) {
  const [data, setData] = useState<ProjectData | null>(null);
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
        if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Unable to load your construction details.");
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); }), []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const onFocus = () => { void load(controller.signal); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const estimates = data?.estimates ?? [];
  const projects = data?.projects ?? [];
  const unlocked = (data?.designs ?? []).filter((design) => design.access === "unlocked");
  const hasEstimate = (designId: string) => estimates.some((estimate) => estimate.designRequestId === designId);
  const available = unlocked.filter((design) => !hasEstimate(design.id));
  const starting = available.find((design) => design.id === startingId) ?? null;
  const focusId = estimates.find((estimate) => estimate.id === estimateId)?.id
    ?? estimates.find((estimate) => designRequestId && estimate.designRequestId === designRequestId)?.id
    ?? null;
  const designNotEligible = Boolean(data && designRequestId && !focusId && !unlocked.some((design) => design.id === designRequestId));

  useEffect(() => {
    if (!focusId || scrolledTo.current === focusId) return;
    document.getElementById(`estimate-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrolledTo.current = focusId;
  }, [focusId]);

  const refresh = (message?: string) => {
    if (message) setNotice(message);
    void load();
  };

  const nothingYet = Boolean(data) && !estimates.length && !projects.length && !unlocked.length;

  return (
    <div className="min-w-0 space-y-6">
      <section className="rounded-xl bg-gradient-to-r from-red-950 to-red-800 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-rose-200">From design to construction</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">My Project</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-rose-100">Request construction for your finished design, review your cost estimate, and follow your payment schedule as the house goes up.</p>
        <ol className="mt-5 grid gap-x-6 gap-y-2 text-xs font-semibold sm:flex sm:flex-wrap">
          {["Request construction", "Review the estimate", "Pay the downpayment", "Pay by stage"].map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
        </ol>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">Only your own estimates and projects appear here.</p>
        <Button variant="outline" disabled={loading} onClick={() => { setLoading(true); void load(); }}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <BillingErrorMessage message={error} />
      {notice && <p role="status" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-red-900">{notice}</p>}
      {loading && !data && <p role="status" className="text-sm text-stone-500">Loading your project…</p>}
      {designNotEligible && (
        <p role="status" className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
          That design is not available for construction yet. Construction requests open after your design fee is verified and your design is unlocked.
        </p>
      )}

      {starting && (
        <ConstructionRequestForm
          key={starting.id}
          design={starting}
          onCancel={() => setStartingId(null)}
          onSubmitted={(estimate) => {
            setStartingId(null);
            setNotice(`Construction request sent. G4 Builders will prepare estimate ${estimate.reference} for your review.`);
            void load();
          }}
        />
      )}

      {estimates.length > 0 && (
        <section aria-labelledby="estimates-heading" className="space-y-4">
          <h2 id="estimates-heading" className="text-lg font-semibold tracking-tight">Cost estimates</h2>
          {estimates.map((estimate) => (
            <ConstructionEstimateCard key={estimate.id} estimate={estimate} highlighted={estimate.id === focusId} onChanged={refresh} />
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section aria-labelledby="projects-heading" className="space-y-4">
          <h2 id="projects-heading" className="text-lg font-semibold tracking-tight">Construction projects</h2>
          {projects.map((project) => <ConstructionProjectCard key={project.id} project={project} />)}
        </section>
      )}

      {available.length > 0 && !starting && (
        <BillingPanel>
          <Eyebrow>Ready to build</Eyebrow>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Start a construction request</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">Your unlocked designs can go to construction. Pick one and G4 Builders will prepare an itemized cost estimate for you.</p>
          <ul className="mt-4 divide-y divide-stone-200 rounded-lg border border-stone-200">
            {available.map((design) => (
              <li key={design.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{designTitle(design)}</p>
                  <p className="mt-1 text-xs text-stone-600">{design.floorArea} sqm · {design.finish}</p>
                </div>
                <Button className="min-h-11" onClick={() => { setNotice(null); setStartingId(design.id); }}><HardHat className="mr-2 h-4 w-4" />Start construction request</Button>
              </li>
            ))}
          </ul>
        </BillingPanel>
      )}

      {nothingYet && (
        <section className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center sm:p-10">
          <HardHat className="mx-auto h-10 w-10 text-stone-400" />
          <h2 className="mt-4 text-lg font-semibold">No construction project yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-600">
            Construction starts from a finished house design. Request a design, pay the design fee, and once it is unlocked you can ask G4 Builders to build it. We will prepare a cost estimate for you to accept, and your project begins after the downpayment.
          </p>
          <Button asChild className="mt-5 min-h-11"><Link href="/customer/house-design">Go to My House Design</Link></Button>
        </section>
      )}
    </div>
  );
}
