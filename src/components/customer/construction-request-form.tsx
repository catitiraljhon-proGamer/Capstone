"use client";

import { useState, type FormEvent } from "react";
import { HardHat } from "lucide-react";
import { BillingErrorMessage, BillingPanel, billingJson } from "@/components/billing/billing-primitives";
import { PhAddressFields, readAddressDetails } from "@/components/clients/ph-address-fields";
import { constructionFieldClass, constructionLabelClass, Eyebrow } from "@/components/customer/construction-shared";
import { Button } from "@/components/ui/button";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import type { AddressDetails } from "@/types/clients";
import type { ConstructionRequestInput, CostEstimateDto } from "@/types/construction";
import type { DesignRequestDto } from "@/types/design-requests";

/** YYYY-MM-DD in Manila time, `days` from today. */
function manilaDate(days: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(Date.now() + days * 86_400_000));
}

function addOneDay(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function designTitle(design: DesignRequestDto) {
  return design.selectedDesign?.name ?? `${design.floorArea} sqm custom design`;
}

export function ConstructionRequestForm({ design, onSubmitted, onCancel, showDesignFacts = true }: {
  design: DesignRequestDto;
  /** Hide the design summary when the surrounding card already shows it. */
  showDesignFacts?: boolean;
  onSubmitted: (estimate: CostEstimateDto) => void;
  onCancel: () => void;
}) {
  const [minStart] = useState(() => manilaDate(1));
  // The design request's timespan is only a starting suggestion; the dates must still be in the future.
  const suggestion = design.preferredDate && design.neededBy && design.preferredDate >= minStart && design.neededBy > design.preferredDate ? design : null;
  const [startDate, setStartDate] = useState(suggestion?.preferredDate ?? "");
  const [neededBy, setNeededBy] = useState(suggestion?.neededBy ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    if (startDate < minStart) return setError("Choose a preferred start date from tomorrow onward.");
    if (neededBy <= startDate) return setError("The Needed By date must be after your preferred start date.");
    const input: ConstructionRequestInput = {
      designRequestId: design.id,
      preferredStartDate: startDate,
      neededBy,
      // The server fills in province and city names from the PSGC codes.
      siteAddress: readAddressDetails(data) as AddressDetails,
      notes: String(data.get("notes") ?? "").trim(),
    };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/construction/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const { estimate } = await billingJson<{ estimate: CostEstimateDto }>(response);
      onSubmitted(estimate);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to send your construction request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BillingPanel className="border-red-200">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-red-700"><HardHat className="h-6 w-6" /></div>
        <div className="min-w-0">
          <Eyebrow>Construction request</Eyebrow>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Build {designTitle(design)}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Tell us where and when you want to build. G4 Builders will prepare an itemized cost estimate with a payment schedule for you to review. Nothing is charged until you accept it.
          </p>
        </div>
      </div>

      {showDesignFacts && <dl className="mt-5 grid gap-3 rounded-lg bg-stone-50 p-4 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-stone-500">Design</dt><dd className="mt-1 font-semibold">{designTitle(design)}</dd></div>
        <div><dt className="text-xs text-stone-500">Floor area</dt><dd className="mt-1 font-semibold">{design.floorArea} sqm</dd></div>
        <div><dt className="text-xs text-stone-500">Finish</dt><dd className="mt-1 font-semibold">{design.finish}</dd></div>
      </dl>}

      <form onSubmit={submit} className="mt-6 space-y-5">
        <fieldset disabled={saving} className="min-w-0 space-y-5 disabled:opacity-70">
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <label className={`min-w-0 ${constructionLabelClass}`}>
              Preferred Start Date <RequiredIndicator />
              <input
                type="date" required min={minStart} value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={constructionFieldClass}
              />
              <span className="mt-1 block text-xs font-normal text-stone-500">Construction starts after your downpayment is verified.</span>
            </label>
            <label className={`min-w-0 ${constructionLabelClass}`}>
              Needed By <RequiredIndicator />
              <input
                type="date" required min={startDate ? addOneDay(startDate) : addOneDay(minStart)} value={neededBy}
                onChange={(event) => setNeededBy(event.target.value)}
                className={constructionFieldClass}
              />
              <span className="mt-1 block text-xs font-normal text-stone-500">The date you want the house turned over.</span>
            </label>
          </div>
          <PhAddressFields inputClassName={constructionFieldClass} labelClassName={constructionLabelClass} />
          <p className="-mt-2 text-xs text-stone-500">Enter the address of the lot where the house will be built.</p>
          <label className={`block min-w-0 ${constructionLabelClass}`}>
            Notes (optional)
            <textarea
              name="notes" rows={4} maxLength={1000}
              placeholder="Access to the lot, existing structures, preferred materials, or anything else we should know."
              className={constructionFieldClass}
            />
          </label>
        </fieldset>
        <BillingErrorMessage message={error} />
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={onCancel}>Cancel</Button>
          <Button type="submit" className="min-h-11" disabled={saving}>{saving ? "Sending request…" : "Send construction request"}</Button>
        </div>
      </form>
    </BillingPanel>
  );
}
