"use client";

import { Button } from "@/components/ui/button";
import {
  EstimateBuilder,
  EstimateStatusPill,
  formatEstimateDate,
} from "@/components/admin/admin-estimate-builder";
import { formatPeso } from "@/lib/house-design-data";
import type { CostEstimateDto, EstimateStatus } from "@/types/construction";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const filters = ["All", "Requested", "Draft", "Revision requested", "Sent", "Accepted"] as const;
type Filter = (typeof filters)[number];

const head = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";
const cell = "px-4 py-4 align-top text-sm";

function selectEstimateInUrl(id: string | null) {
  try {
    window.history.replaceState(null, "", id ? `?estimate=${encodeURIComponent(id)}` : window.location.pathname);
  } catch {
    // The URL is a convenience only.
  }
}

export function AdminCostEstimates({ initialEstimateId }: { initialEstimateId: string | null }) {
  const [estimates, setEstimates] = useState<CostEstimateDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(initialEstimateId);

  useEffect(() => {
    let active = true;
    fetch("/api/construction/estimates", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { estimates?: CostEstimateDto[]; error?: string };
        if (!response.ok || !payload.estimates) throw new Error(payload.error ?? "Unable to load cost estimates.");
        return payload.estimates;
      })
      .then((items) => {
        if (active) setEstimates(items);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load cost estimates.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const result: Record<string, number> = { All: estimates.length };
    for (const estimate of estimates) result[estimate.status] = (result[estimate.status] ?? 0) + 1;
    return result;
  }, [estimates]);

  const visible = useMemo(
    () =>
      estimates
        .filter((estimate) => filter === "All" || estimate.status === filter)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [estimates, filter],
  );

  const selected = estimates.find((estimate) => estimate.id === selectedId) ?? null;

  function open(id: string | null) {
    setSelectedId(id);
    selectEstimateInUrl(id);
  }

  function handleUpdated(updated: CostEstimateDto) {
    setEstimates((current) => current.map((estimate) => (estimate.id === updated.id ? updated : estimate)));
  }

  if (selected) {
    return (
      <div className="min-w-0 space-y-5">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <Button type="button" variant="ghost" size="sm" className="-ml-3 mb-2" onClick={() => open(null)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All estimates
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="break-words text-xl font-semibold tracking-tight">{selected.reference}</h1>
              <p className="mt-1 text-sm text-stone-600">
                {selected.customer.name} · {selected.designLabel}
              </p>
            </div>
            <EstimateStatusPill status={selected.status} />
          </div>
        </section>
        <EstimateBuilder key={selected.id} estimate={selected} onUpdated={handleUpdated} />
      </div>
    );
  }

  return (
    <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cost Estimates</h1>
        <p className="mt-1 text-sm text-stone-600">
          Customer construction requests, BOQ estimates, and payment schedules.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
              filter === item
                ? "bg-red-700 text-white ring-red-700"
                : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            {item} <span className="opacity-70">{counts[item] ?? 0}</span>
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-5 text-sm text-stone-500">Loading cost estimates…</p>
      ) : visible.length > 0 ? (
        <div className="-mx-5 mt-5 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <caption className="sr-only">Cost estimates</caption>
            <thead className="border-y border-stone-200 bg-stone-50">
              <tr>
                <th className={head}>Reference / customer</th>
                <th className={head}>Design</th>
                <th className={head}>Preferred start</th>
                <th className={head}>Needed by</th>
                <th className={`${head} text-right`}>Total</th>
                <th className={head}>Status</th>
                <th className={head}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {visible.map((estimate) => (
                <tr key={estimate.id} className="hover:bg-rose-50/30">
                  <td className={cell}>
                    <p className="font-semibold">{estimate.reference}</p>
                    <p className="mt-1 text-stone-600">{estimate.customer.name}</p>
                  </td>
                  <td className={`${cell} max-w-56 break-words`}>{estimate.designLabel}</td>
                  <td className={`${cell} whitespace-nowrap`}>{formatEstimateDate(estimate.preferredStartDate)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{formatEstimateDate(estimate.neededBy)}</td>
                  <td className={`${cell} whitespace-nowrap text-right font-semibold tabular-nums`}>
                    {estimate.total > 0 ? formatPeso(estimate.total) : "—"}
                  </td>
                  <td className={cell}>
                    <EstimateStatusPill status={estimate.status as EstimateStatus} />
                  </td>
                  <td className={cell}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Open ${estimate.reference}`}
                      onClick={() => open(estimate.id)}
                    >
                      {["Requested", "Draft", "Revision requested"].includes(estimate.status) ? "Build" : "View"}
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
          {estimates.length === 0 ? "No construction requests yet." : "No estimates match this filter."}
        </p>
      )}
    </section>
  );
}
