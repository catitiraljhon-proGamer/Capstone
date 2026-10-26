"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminProjectSlides } from "@/components/admin/admin-project-slides";
import { AdminWarrantyClaims, openClaimCount } from "@/components/admin/admin-warranty-claims";
import { billingJson } from "@/components/billing/billing-primitives";
import type { WarrantyClaimsResponse } from "@/types/warranty";

type Tab = "projects" | "warranty";

/** Keeps the tab and the open claim in the address, so a notification link or a reload lands on the same view. */
function syncAddress(tab: Tab, claimId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete("tab");
  url.searchParams.delete("claim");
  if (tab === "warranty") url.searchParams.set("tab", "warranty");
  if (claimId) url.searchParams.set("claim", claimId);
  window.history.replaceState(null, "", url);
}

/** Admin Projects: the project records and the warranty claims customers report on completed houses. */
export function AdminProjects({ initialTab, initialClaimId }: { initialTab: Tab; initialClaimId: string | null }) {
  const [tab, setTab] = useState<Tab>(initialClaimId ? "warranty" : initialTab);
  const [claimId, setClaimId] = useState<string | null>(initialClaimId);
  const [claims, setClaims] = useState<WarrantyClaimsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) =>
    fetch("/api/warranty-claims", { cache: "no-store", signal })
      .then((response) => billingJson<WarrantyClaimsResponse>(response))
      .then((payload) => { if (!signal?.aborted) { setClaims(payload); setError(null); } })
      .catch((loadError: unknown) => {
        if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : "The warranty claims could not be loaded.");
      }), []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const open = openClaimCount(claims);
  const choose = (next: Tab) => { setTab(next); setClaimId(null); syncAddress(next, null); };
  const select = (id: string | null) => { setClaimId(id); syncAddress("warranty", id); window.scrollTo({ top: 0 }); };
  const tabClass = (active: boolean) =>
    `inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${active ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950"}`;

  return (
    <div className="min-w-0 space-y-5">
      <div role="tablist" aria-label="Projects sections" className="inline-flex flex-wrap gap-1 rounded-xl bg-stone-100 p-1">
        <button type="button" role="tab" id="tab-projects" aria-selected={tab === "projects"} aria-controls="panel-projects" onClick={() => choose("projects")} className={tabClass(tab === "projects")}>
          Projects
        </button>
        <button type="button" role="tab" id="tab-warranty" aria-selected={tab === "warranty"} aria-controls="panel-warranty" onClick={() => choose("warranty")} className={tabClass(tab === "warranty")}>
          Warranty Claims
          {open ? <span className="rounded-full bg-red-700 px-2 py-0.5 text-[11px] text-white">{open} open</span> : null}
        </button>
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "projects"
          ? <AdminProjectSlides />
          : <AdminWarrantyClaims data={claims} error={error} selectedId={claimId} onSelect={select} onChanged={() => void load()} />}
      </div>
    </div>
  );
}
