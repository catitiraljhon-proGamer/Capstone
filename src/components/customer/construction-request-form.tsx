"use client";

import { useRef, useState, type FormEvent } from "react";
import { HardHat } from "lucide-react";
import { BillingErrorMessage, BillingPanel, billingJson } from "@/components/billing/billing-primitives";
import { PhAddressFields, readAddressDetails, type AddressFieldErrors } from "@/components/clients/ph-address-fields";
import { constructionFieldClass, constructionLabelClass, Eyebrow } from "@/components/customer/construction-shared";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { dateError, manilaDay, textError } from "@/lib/form-validation";
import type { AddressDetails } from "@/types/clients";
import type { ConstructionRequestInput, CostEstimateDto } from "@/types/construction";
import type { DesignRequestDto } from "@/types/design-requests";

const NOTES_MAX = 2000;

type AddressKey = "province" | "city" | "barangay" | "street" | "postalCode";
type AddressErrors = Record<AddressKey, string | null>;
/** Form control name for each address field, in the order they appear on screen. */
const addressFields: [AddressKey, string][] = [
  ["province", "addressProvinceCode"],
  ["city", "addressCityCode"],
  ["barangay", "addressBarangayCode"],
  ["street", "addressStreet"],
  ["postalCode", "addressPostalCode"],
];
const noAddressErrors: AddressErrors = { province: null, city: null, barangay: null, street: null, postalCode: null };

function addressErrorsOf(form: HTMLFormElement): AddressErrors {
  const address = readAddressDetails(new FormData(form));
  return {
    province: address.provinceCode ? null : "Choose the province.",
    city: address.cityCode ? null : "Choose the city or municipality.",
    barangay: address.barangayCode ? null : "Choose the barangay.",
    street: address.street.length >= 2 ? null : "Enter the house number and street.",
    postalCode: !address.postalCode ? "Enter the postal code." : /^\d{4}$/.test(address.postalCode) ? null : "Postal code must be 4 digits.",
  };
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
  const [minStart] = useState(() => manilaDay(1));
  // The design request's timespan is only a starting suggestion; the dates must still be in the future.
  const suggestion = design.preferredDate && design.neededBy && design.preferredDate >= minStart && design.neededBy > design.preferredDate ? design : null;
  const [startDate, setStartDate] = useState(suggestion?.preferredDate ?? "");
  const [neededBy, setNeededBy] = useState(suggestion?.neededBy ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [addressErrors, setAddressErrors] = useState<AddressErrors>(noAddressErrors);
  const formRef = useRef<HTMLFormElement>(null);

  const startError = dateError(startDate, { label: "Preferred start date" }) ?? (startDate < minStart ? "Preferred start date must be after today." : null);
  const neededError =
    dateError(neededBy, { label: "Needed by date" }) ??
    (startDate && !startError && neededBy <= startDate
      ? "The Needed By date must be after your preferred start date."
      : neededBy < minStart
        ? "Needed By date must be after today."
        : null);
  const notesError = textError(notes, { label: "Notes", required: false, max: NOTES_MAX });
  const show = (key: string, message: string | null) => (submitted || touched.has(key) ? message : null);
  const touch = (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  const startMessage = show("start", startError);
  const neededMessage = show("needed", neededError);
  const notesMessage = show("notes", notesError);

  /** Re-reads the address controls after React has applied the change (cascading selects reset later fields). */
  function refreshAddress(event: { target: EventTarget }) {
    const form = formRef.current;
    const name = event.target instanceof HTMLElement ? event.target.getAttribute("name") : null;
    const key = addressFields.find(([, field]) => field === name)?.[0];
    if (key) touch(key);
    if (form) setTimeout(() => setAddressErrors(addressErrorsOf(form)), 0);
  }
  // Shown under each address control by PhAddressFields, keyed by its form field name.
  const shownAddressErrors = Object.fromEntries(
    addressFields.map(([key, name]) => [name, show(key, addressErrors[key])]),
  ) as AddressFieldErrors;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const addressNow = addressErrorsOf(form);
    setAddressErrors(addressNow);
    setSubmitted(true);
    const firstAddress = addressFields.find(([key]) => addressNow[key]);
    const invalid =
      startError ? "request-start-date"
      : neededError ? "request-needed-by"
      : firstAddress ? firstAddress[1]
      : notesError ? "request-notes"
      : null;
    if (invalid) {
      setError("Fix the highlighted fields before sending your request.");
      const target = form.elements.namedItem(invalid) ?? document.getElementById(invalid);
      if (target instanceof HTMLElement) target.focus();
      return;
    }
    const input: ConstructionRequestInput = {
      designRequestId: design.id,
      preferredStartDate: startDate,
      neededBy,
      // The server fills in province and city names from the PSGC codes.
      siteAddress: readAddressDetails(data) as AddressDetails,
      notes: notes.trim(),
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

      <form ref={formRef} noValidate onSubmit={submit} className="mt-6 space-y-5">
        <fieldset disabled={saving} className="min-w-0 space-y-5 disabled:opacity-70">
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <label className={`min-w-0 ${constructionLabelClass}`}>
              Preferred Start Date <RequiredIndicator />
              <input
                id="request-start-date" type="date" min={minStart} value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                onBlur={() => touch("start")}
                aria-invalid={startMessage ? true : undefined}
                aria-describedby={startMessage ? "request-start-date-error" : undefined}
                className={`${constructionFieldClass} aria-invalid:border-red-600`}
              />
              {startMessage
                ? <FieldError id="request-start-date-error" message={startMessage} />
                : <span className="mt-1 block text-xs font-normal text-stone-500">Construction starts after your downpayment is verified.</span>}
            </label>
            <label className={`min-w-0 ${constructionLabelClass}`}>
              Needed By <RequiredIndicator />
              <input
                id="request-needed-by" type="date" min={startDate ? addOneDay(startDate) : addOneDay(minStart)} value={neededBy}
                onChange={(event) => setNeededBy(event.target.value)}
                onBlur={() => touch("needed")}
                aria-invalid={neededMessage ? true : undefined}
                aria-describedby={neededMessage ? "request-needed-by-error" : undefined}
                className={`${constructionFieldClass} aria-invalid:border-red-600`}
              />
              {neededMessage
                ? <FieldError id="request-needed-by-error" message={neededMessage} />
                : <span className="mt-1 block text-xs font-normal text-stone-500">The date you want the house turned over.</span>}
            </label>
          </div>
          <div onChange={refreshAddress} onBlur={refreshAddress}>
            <PhAddressFields inputClassName={`${constructionFieldClass} aria-invalid:border-red-600`} labelClassName={constructionLabelClass} errors={shownAddressErrors} />
          </div>
          <p className="-mt-2 text-xs text-stone-500">Enter the address of the lot where the house will be built.</p>
          <label className={`block min-w-0 ${constructionLabelClass}`}>
            Notes (optional)
            <textarea
              id="request-notes" name="notes" rows={4} value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => touch("notes")}
              aria-invalid={notesMessage ? true : undefined}
              aria-describedby={notesMessage ? "request-notes-error" : undefined}
              placeholder="Access to the lot, existing structures, preferred materials, or anything else we should know."
              className={`${constructionFieldClass} aria-invalid:border-red-600`}
            />
            {notesMessage
              ? <FieldError id="request-notes-error" message={notesMessage} />
              : <span className="mt-1 block text-right text-xs font-normal text-stone-500">{notes.length}/{NOTES_MAX}</span>}
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
