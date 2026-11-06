"use client";

import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { textError } from "@/lib/form-validation";
import { loadProvinceCities, loadProvinces, type PhCity, type PhPlace } from "@/lib/ph-address";
import type { AddressDetails } from "@/types/clients";
import { useEffect, useId, useState } from "react";

/** Form field names read by readAddressDetails(). */
const fieldNames = {
  provinceCode: "addressProvinceCode",
  cityCode: "addressCityCode",
  barangayCode: "addressBarangayCode",
  barangay: "addressBarangay",
  street: "addressStreet",
  postalCode: "addressPostalCode",
} as const;

export type AddressDetailsInput = Pick<
  AddressDetails,
  "provinceCode" | "cityCode" | "barangayCode" | "barangay" | "street" | "postalCode"
>;

export function readAddressDetails(data: FormData): AddressDetailsInput {
  const value = (key: string) => String(data.get(key) ?? "").trim();
  return {
    provinceCode: value(fieldNames.provinceCode),
    cityCode: value(fieldNames.cityCode),
    barangayCode: value(fieldNames.barangayCode),
    barangay: value(fieldNames.barangay),
    street: value(fieldNames.street),
    postalCode: value(fieldNames.postalCode),
  };
}

export type AddressFieldName =
  | typeof fieldNames.provinceCode
  | typeof fieldNames.cityCode
  | typeof fieldNames.barangayCode
  | typeof fieldNames.street
  | typeof fieldNames.postalCode;

/** Messages keyed by the form field name; null or missing means the field is fine. */
export type AddressFieldErrors = Partial<Record<AddressFieldName, string | null>>;

/**
 * Checks the address fields the way the server does (see server/ph-address.ts).
 * City and barangay are only checked once the list before them has a choice,
 * since those dropdowns stay disabled until then.
 */
export function addressFieldErrors(values: Record<string, string | undefined>): AddressFieldErrors {
  const get = (key: string) => (values[key] ?? "").trim();
  const errors: AddressFieldErrors = {};
  if (!get(fieldNames.provinceCode)) errors[fieldNames.provinceCode] = "Select your province.";
  else if (!get(fieldNames.cityCode)) errors[fieldNames.cityCode] = "Select your city or municipality.";
  else if (!get(fieldNames.barangayCode)) errors[fieldNames.barangayCode] = "Select your barangay.";

  const street = textError(get(fieldNames.street), { label: "House no. / street", required: false, min: 2, max: 200 });
  if (street) errors[fieldNames.street] = street;

  // The postal code fills in from the city or barangay, so it is only checked once a barangay is chosen.
  const postal = get(fieldNames.postalCode);
  if (!get(fieldNames.barangayCode)) return errors;
  if (!postal) errors[fieldNames.postalCode] = "Enter the 4-digit postal code.";
  else if (!/^\d{4}$/.test(postal)) errors[fieldNames.postalCode] = "Postal code must be exactly 4 digits.";
  return errors;
}

type PhAddressFieldsProps = {
  defaultValue?: AddressDetails | null;
  /** Text address saved before the dropdowns existed, shown as a reminder. */
  legacyAddress?: string;
  inputClassName: string;
  labelClassName: string;
  /** Optional per-field messages shown under each dropdown or input. */
  errors?: AddressFieldErrors;
};

/**
 * Luzon province, city/municipality, and barangay dropdowns (PSA PSGC, sorted A to Z)
 * plus street and postal code. Each list depends on the choice before it. The postal code
 * fills itself in from the city (or the barangay in Metro Manila) and is typed only where
 * no code is known.
 */
export function PhAddressFields({
  defaultValue,
  legacyAddress,
  inputClassName,
  labelClassName,
  errors,
}: PhAddressFieldsProps) {
  const id = useId();
  const [provinces, setProvinces] = useState<PhPlace[]>([]);
  const [cities, setCities] = useState<PhCity[]>([]);
  const [provinceCode, setProvinceCode] = useState(defaultValue?.provinceCode ?? "");
  const [cityCode, setCityCode] = useState(defaultValue?.cityCode ?? "");
  const [barangayCode, setBarangayCode] = useState(defaultValue?.barangayCode ?? "");
  const [postalCode, setPostalCode] = useState(defaultValue?.postalCode ?? "");
  const [loadingCities, setLoadingCities] = useState(Boolean(defaultValue?.provinceCode));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadProvinces()
      .then((list) => {
        if (active) setProvinces(list);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load provinces.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!provinceCode) return;
    let active = true;
    loadProvinceCities(provinceCode)
      .then((list) => {
        if (active) setCities(list);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load cities.");
      })
      .finally(() => {
        if (active) setLoadingCities(false);
      });
    return () => {
      active = false;
    };
  }, [provinceCode]);

  const city = cities.find((item) => item.code === cityCode);
  const barangays = city?.barangays ?? [];
  const barangay = barangays.find((item) => item.code === barangayCode);
  // Filled in from the place; typed only once a barangay is chosen and no code is known for it.
  const autoPostalCode = city?.postalCode ?? barangay?.postalCode;
  const typesPostalCode = !autoPostalCode && Boolean(barangay);
  const postalHint = autoPostalCode
    ? `Filled in from your ${city?.postalCode ? "city or municipality" : "barangay"}.`
    : typesPostalCode
      ? "We don't have this barangay's postal code. Enter it here."
      : city
        ? "Fills in after you choose your barangay."
        : "Fills in after you choose your city or municipality.";
  const selectClassName = `${inputClassName} aria-invalid:border-red-600 disabled:cursor-not-allowed disabled:opacity-60`;
  const invalidClassName = `${inputClassName} aria-invalid:border-red-600`;
  const errorFor = (name: AddressFieldName) => errors?.[name] ?? null;
  /** aria attributes tying a control to its message; undefined when valid. */
  const describe = (name: AddressFieldName, suffix: string) => {
    const message = errorFor(name);
    return {
      "aria-invalid": message ? true : undefined,
      "aria-describedby": message ? `${id}-${suffix}-error` : undefined,
    } as const;
  };

  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className={`${labelClassName} mb-2`}>
        Complete Address <RequiredIndicator />
      </legend>
      <p className="text-xs text-stone-500">We currently serve projects in Luzon only.</p>
      {legacyAddress && !defaultValue ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
          Address on file: <span className="font-medium text-stone-800">{legacyAddress}</span>. Search for it in the
          fields below to update it.
        </p>
      ) : null}
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-province`}>
            Province <RequiredIndicator />
            <SearchableSelect
              id={`${id}-province`}
              name={fieldNames.provinceCode}
              {...describe(fieldNames.provinceCode, "province")}
              required
              value={provinceCode}
              onChange={(code) => {
                setProvinceCode(code);
                setCities([]);
                setCityCode("");
                setBarangayCode("");
                setPostalCode("");
                setLoadingCities(Boolean(code));
              }}
              options={provinces.map((item) => ({ value: item.code, label: item.name }))}
              placeholder={provinces.length ? "Search province" : "Loading provinces…"}
              emptyMessage="No province matches that name."
              className={selectClassName}
            />
          </label>
          <FieldError id={`${id}-province-error`} message={errorFor(fieldNames.provinceCode)} />
        </div>
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-city`}>
            City / Municipality <RequiredIndicator />
            <SearchableSelect
              id={`${id}-city`}
              name={fieldNames.cityCode}
              {...describe(fieldNames.cityCode, "city")}
              required
              disabled={!provinceCode || loadingCities}
              value={cityCode}
              onChange={(code) => {
                setCityCode(code);
                setBarangayCode("");
                setPostalCode("");
              }}
              options={cities.map((item) => ({ value: item.code, label: item.name }))}
              placeholder={!provinceCode ? "Select province first" : loadingCities ? "Loading…" : "Search city / municipality"}
              emptyMessage="No city or municipality matches that name."
              className={selectClassName}
            />
          </label>
          <FieldError id={`${id}-city-error`} message={errorFor(fieldNames.cityCode)} />
        </div>
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-barangay`}>
            Barangay <RequiredIndicator />
            <SearchableSelect
              id={`${id}-barangay`}
              name={fieldNames.barangayCode}
              {...describe(fieldNames.barangayCode, "barangay")}
              required
              disabled={!city}
              value={barangayCode}
              onChange={(code) => {
                setBarangayCode(code);
                setPostalCode("");
              }}
              options={barangays.map((item) => ({ value: item.code, label: item.name }))}
              placeholder={city ? "Search barangay" : "Select city first"}
              emptyMessage="No barangay matches that name."
              className={selectClassName}
            />
          </label>
          <FieldError id={`${id}-barangay-error`} message={errorFor(fieldNames.barangayCode)} />
        </div>
      </div>
      <input type="hidden" name={fieldNames.barangay} value={barangay?.name ?? ""} />
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-street`}>
            House No. / Street (optional)
            <input
              id={`${id}-street`}
              name={fieldNames.street}
              {...describe(fieldNames.street, "street")}
              autoComplete="address-line1"
              minLength={2}
              maxLength={200}
              placeholder="Enter house no. / street"
              defaultValue={defaultValue?.street ?? ""}
              className={invalidClassName}
            />
          </label>
          <FieldError id={`${id}-street-error`} message={errorFor(fieldNames.street)} />
        </div>
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-postal`}>
            Postal Code <RequiredIndicator />
            <input
              id={`${id}-postal`}
              name={fieldNames.postalCode}
              {...describe(fieldNames.postalCode, "postal")}
              aria-describedby={[errorFor(fieldNames.postalCode) ? `${id}-postal-error` : undefined, `${id}-postal-hint`].filter(Boolean).join(" ")}
              autoComplete="postal-code"
              inputMode="numeric"
              required
              readOnly={!typesPostalCode}
              pattern="\d{4}"
              maxLength={4}
              placeholder={typesPostalCode ? "Enter postal code" : "Auto-filled"}
              title="Enter a 4-digit postal code."
              value={autoPostalCode ?? (typesPostalCode ? postalCode : "")}
              onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              className={`${invalidClassName} read-only:cursor-default read-only:bg-stone-50 read-only:text-stone-700 read-only:focus:border-stone-200 read-only:focus:ring-0`}
            />
          </label>
          <p id={`${id}-postal-hint`} className="mt-1 text-xs text-stone-500">{postalHint}</p>
          <FieldError id={`${id}-postal-error`} message={errorFor(fieldNames.postalCode)} />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </fieldset>
  );
}
