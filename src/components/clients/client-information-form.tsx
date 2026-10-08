"use client";

import { useId, useMemo, useState, type FocusEvent, type FormEvent } from "react";
import {
  addressFieldErrors,
  PhAddressFields,
  readAddressDetails,
  type AddressDetailsInput,
  type AddressFieldErrors,
} from "@/components/clients/ph-address-fields";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { numberError, textError } from "@/lib/form-validation";
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

/**
 * edit: existing client (email is read-only). create: admin adds a client with
 * an initial password. register: self sign-up, which also confirms the password.
 */
export type ClientFormMode = "edit" | "create" | "register";

type FieldErrors = Record<string, string | null | undefined>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function contactNumberError(raw: string) {
  const text = raw.trim();
  if (!text) return "Enter the contact number.";
  if (text.length > 25) return "Contact number must be 25 characters or fewer.";
  if (!/^\+?[0-9 ()-]+$/.test(text)) return "Use digits, spaces, parentheses, hyphens, and an optional leading + (for example 0917 123 4567).";
  const digits = text.replace(/\D/g, "").length;
  if (digits < 7 || digits > 15) return "The contact number must contain 7 to 15 digits (for example 0917 123 4567).";
  return null;
}

function emailError(raw: string) {
  const text = raw.trim();
  if (!text) return "Enter the email address.";
  if (text.length > 254) return "Email address must be 254 characters or fewer.";
  if (!emailPattern.test(text)) return "Enter a valid email address, for example name@example.com.";
  return null;
}

function passwordError(raw: string) {
  if (!raw) return "Enter a password.";
  if (raw.length < 8) return "Password must be at least 8 characters.";
  if (raw.length > 72) return "Password must be 72 characters or fewer.";
  return null;
}

/** Client-side mirror of the server rules in lib/server/clients.ts and the register route. */
export function clientFieldErrors(values: Record<string, string>, mode: ClientFormMode): FieldErrors {
  const errors: FieldErrors = {
    name: textError(values.name ?? "", { label: "Full name", min: 2, max: 100 }),
    age: numberError(values.age ?? "", { label: "Age", integer: true, min: 0, max: 120, unit: " years" }),
    contactNumber: contactNumberError(values.contactNumber ?? ""),
    occupation: textError(values.occupation ?? "", { label: "Occupation", required: false, max: 100 }),
    ...addressFieldErrors(values),
  };
  if (mode !== "edit") {
    errors.email = emailError(values.email ?? "");
    errors.password = passwordError(values.password ?? "");
  }
  if (mode === "register") {
    errors.confirmPassword = !values.confirmPassword
      ? "Re-enter the password to confirm it."
      : values.confirmPassword !== values.password ? "The passwords do not match." : null;
  }
  return errors;
}

/** Every named field in the form as a plain string record. */
export function readFormValues(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form)) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/**
 * Shared validation behaviour for the client-details fields: a message shows
 * under a field after it loses focus or after a submit attempt, and a failed
 * submit focuses the first invalid field. Spread `formProps` onto the form.
 */
export function useClientFormValidation(mode: ClientFormMode) {
  const prefix = useId();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const errors = useMemo<FieldErrors>(() => (values ? clientFieldErrors(values, mode) : {}), [values, mode]);

  const error = (name: string) => (submitted || touched[name] ? errors[name] ?? null : null);
  const errorId = (name: string) => `${prefix}-${name}-error`;
  const describe = (name: string) => {
    const message = error(name);
    return { "aria-invalid": message ? true : undefined, "aria-describedby": message ? errorId(name) : undefined } as const;
  };
  const addressErrors: AddressFieldErrors = {
    addressProvinceCode: error("addressProvinceCode"),
    addressCityCode: error("addressCityCode"),
    addressBarangayCode: error("addressBarangayCode"),
    addressStreet: error("addressStreet"),
    addressPostalCode: error("addressPostalCode"),
  };

  const formProps = {
    noValidate: true,
    // Read after React has applied the change, so cascading address dropdowns are up to date.
    onChange: (event: FormEvent<HTMLFormElement>) => {
      const form = event.currentTarget;
      setTimeout(() => setValues(readFormValues(form)), 0);
    },
    onBlur: (event: FocusEvent<HTMLFormElement>) => {
      const name = (event.target as unknown as HTMLInputElement).name;
      if (name) setTouched((current) => (current[name] ? current : { ...current, [name]: true }));
      setValues(readFormValues(event.currentTarget));
    },
  };

  /** Shows every message and focuses the first invalid field; returns the values when all are valid. */
  const validate = (form: HTMLFormElement) => {
    const next = readFormValues(form);
    setValues(next);
    setSubmitted(true);
    const found = clientFieldErrors(next, mode);
    const firstInvalid = Array.from(form.elements).find((element) => {
      const name = (element as HTMLInputElement).name;
      return Boolean(name && found[name]);
    });
    if (firstInvalid) {
      (firstInvalid as HTMLElement).focus();
      return null;
    }
    return next;
  };

  return { formProps, error, errorId, describe, addressErrors, validate };
}

const fieldClass = "mt-2 min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-950 outline-none placeholder:text-stone-500 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 read-only:bg-stone-50 aria-invalid:border-red-600 sm:text-sm";

export function ClientInformationForm({ client, creating = false, submitLabel, onSave, onCancel }: {
  client?: ClientDto;
  creating?: boolean;
  submitLabel?: string;
  onSave: (input: ClientFormInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const validation = useClientFormValidation(creating ? "create" : "edit");
  const { describe, error: fieldError, errorId } = validation;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    if (!validation.validate(form)) return;
    const data = new FormData(form);
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
    <form onSubmit={submit} {...validation.formProps} className="space-y-5">
      <p className="text-sm leading-6 text-stone-600">
        Enter the client’s personal and contact information. Fields marked with a red asterisk (<RequiredIndicator />) are required. Occupation is optional.
      </p>
      <fieldset disabled={saving} className="grid min-w-0 gap-5 disabled:opacity-70 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="block text-sm font-medium text-stone-700">
            Full name <RequiredIndicator />
            <input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Enter full name" defaultValue={client?.name ?? ""} className={fieldClass} {...describe("name")} />
          </label>
          <FieldError id={errorId("name")} message={fieldError("name")} />
        </div>
        <div className="min-w-0">
          <label className="block text-sm font-medium text-stone-700">
            Age (years) <RequiredIndicator />
            <input name="age" type="number" inputMode="numeric" required min={0} max={120} step={1} placeholder="Enter age in years" defaultValue={client?.age ?? ""} className={fieldClass} {...describe("age")} />
          </label>
          <FieldError id={errorId("age")} message={fieldError("age")} />
        </div>
        <div className="min-w-0">
          <label className="block text-sm font-medium text-stone-700">
            Email address {creating && <RequiredIndicator />}
            <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="Enter email address" readOnly={!creating} defaultValue={client?.email ?? ""} className={fieldClass} {...describe("email")} />
            {!creating && <span className="mt-1 block text-xs font-normal text-stone-500">This is the email used to sign in.</span>}
          </label>
          <FieldError id={errorId("email")} message={fieldError("email")} />
        </div>
        <div className="min-w-0">
          <label className="block text-sm font-medium text-stone-700">
            Contact number <RequiredIndicator />
            <input name="contactNumber" type="tel" autoComplete="tel" required minLength={7} maxLength={25} placeholder="Enter contact number" defaultValue={client?.contactNumber ?? ""} className={fieldClass} {...describe("contactNumber")} />
            <span className="mt-1 block text-xs font-normal text-stone-500">Example: 0917 123 4567 or +63 917 123 4567.</span>
          </label>
          <FieldError id={errorId("contactNumber")} message={fieldError("contactNumber")} />
        </div>
        <div className="min-w-0 sm:col-span-2">
          <PhAddressFields
            defaultValue={client?.addressDetails}
            legacyAddress={client?.address}
            inputClassName={fieldClass}
            labelClassName="block text-sm font-medium text-stone-700"
            errors={validation.addressErrors}
          />
        </div>
        <div className="min-w-0 sm:col-span-2">
          <label className="block text-sm font-medium text-stone-700">
            Occupation (optional)
            <input name="occupation" maxLength={100} placeholder="Enter occupation (optional)" defaultValue={client?.occupation ?? ""} className={fieldClass} {...describe("occupation")} />
          </label>
          <FieldError id={errorId("occupation")} message={fieldError("occupation")} />
        </div>
        {creating && <div className="min-w-0 sm:col-span-2">
          <label className="block text-sm font-medium text-stone-700">
            Initial account password <RequiredIndicator />
            <input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} placeholder="Enter initial account password" className={fieldClass} {...describe("password")} />
            <span className="mt-1 block text-xs font-normal text-stone-500">At least 8 characters. The new account will have client access.</span>
          </label>
          <FieldError id={errorId("password")} message={fieldError("password")} />
        </div>}
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
