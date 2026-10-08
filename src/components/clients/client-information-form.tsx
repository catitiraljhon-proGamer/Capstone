"use client";

import { useState, type FormEvent } from "react";
import { PhAddressFields, readAddressDetails, type AddressDetailsInput } from "@/components/clients/ph-address-fields";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import type { ClientDto } from "@/types/clients";

export type ClientFormInput = {
  name: string;
  age: number;
  contactNumber: string;
  occupation: string;
  addressDetails: AddressDetailsInput;
  email?: string;
  password?: string;
};

const fieldClass = "mt-2 min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-950 outline-none placeholder:text-stone-500 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 read-only:bg-stone-50 sm:text-sm";

export function ClientInformationForm({ client, creating = false, submitLabel, onSave, onCancel }: {
  client?: ClientDto;
  creating?: boolean;
  submitLabel?: string;
  onSave: (input: ClientFormInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: value("name"), age: Number(value("age")),
        contactNumber: value("contactNumber"), addressDetails: readAddressDetails(data), occupation: value("occupation"),
        ...(creating ? { email: value("email"), password: value("password") } : {}),
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save client information.");
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm leading-6 text-stone-600">
        Enter the client’s personal and contact information. Fields marked with a red asterisk (<RequiredIndicator />) are required. Occupation is optional.
      </p>
      <fieldset disabled={saving} className="grid min-w-0 gap-5 disabled:opacity-70 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-medium text-stone-700">
          Full name <RequiredIndicator />
          <input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Enter full name" defaultValue={client?.name ?? ""} className={fieldClass} />
        </label>
        <label className="min-w-0 text-sm font-medium text-stone-700">
          Age (years) <RequiredIndicator />
          <input name="age" type="number" inputMode="numeric" required min={0} max={120} step={1} placeholder="Enter age in years" defaultValue={client?.age ?? ""} className={fieldClass} />
        </label>
        <label className="min-w-0 text-sm font-medium text-stone-700">
          Email address {creating && <RequiredIndicator />}
          <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="Enter email address" readOnly={!creating} defaultValue={client?.email ?? ""} className={fieldClass} />
          {!creating && <span className="mt-1 block text-xs font-normal text-stone-500">This is the email used to sign in.</span>}
        </label>
        <label className="min-w-0 text-sm font-medium text-stone-700">
          Contact number <RequiredIndicator />
          <input name="contactNumber" type="tel" autoComplete="tel" required minLength={7} maxLength={25} placeholder="Enter contact number" defaultValue={client?.contactNumber ?? ""} className={fieldClass} />
          <span className="mt-1 block text-xs font-normal text-stone-500">Example: 0917 123 4567 or +63 917 123 4567.</span>
        </label>
        <div className="min-w-0 sm:col-span-2">
          <PhAddressFields
            defaultValue={client?.addressDetails}
            legacyAddress={client?.address}
            inputClassName={fieldClass}
            labelClassName="block text-sm font-medium text-stone-700"
          />
        </div>
        <label className="min-w-0 text-sm font-medium text-stone-700 sm:col-span-2">
          Occupation (optional)
          <input name="occupation" maxLength={100} placeholder="Enter occupation (optional)" defaultValue={client?.occupation ?? ""} className={fieldClass} />
        </label>
        {creating && <label className="min-w-0 text-sm font-medium text-stone-700 sm:col-span-2">
          Initial account password <RequiredIndicator />
          <input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} placeholder="Enter initial account password" className={fieldClass} />
          <span className="mt-1 block text-xs font-normal text-stone-500">At least 8 characters. The new account will have client access.</span>
        </label>}
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {onCancel && <button type="button" disabled={saving} onClick={onCancel} className="min-h-11 rounded-lg border border-stone-200 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Cancel</button>}
        <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50">
          {saving ? "Saving…" : submitLabel ?? (creating ? "Create client" : "Save client information")}
        </button>
      </div>
    </form>
  );
}
