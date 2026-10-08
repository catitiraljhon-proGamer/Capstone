"use client";

import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
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

  const street = textError(get(fieldNames.street), { label: "House no. / street", min: 2, max: 200 });
  if (street) errors[fieldNames.street] = street;

  const postal = get(fieldNames.postalCode);
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
 * Province, city/municipality, and barangay dropdowns (PSA PSGC, sorted A to Z)
 * plus street and postal code. Each list depends on the choice before it.
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
        Complete address <RequiredIndicator />
      </legend>
      {legacyAddress && !defaultValue ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
          Address on file: <span className="font-medium text-stone-800">{legacyAddress}</span>. Choose it from the
          lists below to update it.
        </p>
      ) : null}
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-province`}>
            Province <RequiredIndicator />
            <select
              id={`${id}-province`}
              name={fieldNames.provinceCode}
              {...describe(fieldNames.provinceCode, "province")}
              required
              value={provinceCode}
              onChange={(event) => {
                setProvinceCode(event.target.value);
                setCities([]);
                setCityCode("");
                setBarangayCode("");
                setLoadingCities(Boolean(event.target.value));
              }}
              className={selectClassName}
            >
              <option value="">{provinces.length ? "Select province" : "Loading provinces…"}</option>
              {provinces.map((item) => (
                <option key={item.code} value={item.code}>{item.name}</option>
              ))}
            </select>
          </label>
          <FieldError id={`${id}-province-error`} message={errorFor(fieldNames.provinceCode)} />
        </div>
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-city`}>
            City / municipality <RequiredIndicator />
            <select
              id={`${id}-city`}
              name={fieldNames.cityCode}
              {...describe(fieldNames.cityCode, "city")}
              required
              disabled={!provinceCode || loadingCities}
              value={cityCode}
              onChange={(event) => {
                setCityCode(event.target.value);
                setBarangayCode("");
              }}
              className={selectClassName}
            >
              <option value="">
                {!provinceCode ? "Select province first" : loadingCities ? "Loading…" : "Select city / municipality"}
              </option>
              {cities.map((item) => (
                <option key={item.code} value={item.code}>{item.name}</option>
              ))}
            </select>
          </label>
          <FieldError id={`${id}-city-error`} message={errorFor(fieldNames.cityCode)} />
        </div>
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-barangay`}>
            Barangay <RequiredIndicator />
            <select
              id={`${id}-barangay`}
              name={fieldNames.barangayCode}
              {...describe(fieldNames.barangayCode, "barangay")}
              required
              disabled={!city}
              value={barangayCode}
              onChange={(event) => setBarangayCode(event.target.value)}
              className={selectClassName}
            >
              <option value="">{city ? "Select barangay" : "Select city first"}</option>
              {barangays.map((item) => (
                <option key={item.code} value={item.code}>{item.name}</option>
              ))}
            </select>
          </label>
          <FieldError id={`${id}-barangay-error`} message={errorFor(fieldNames.barangayCode)} />
        </div>
      </div>
      <input type="hidden" name={fieldNames.barangay} value={barangay?.name ?? ""} />
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-street`}>
            House no. / street <RequiredIndicator />
            <input
              id={`${id}-street`}
              name={fieldNames.street}
              {...describe(fieldNames.street, "street")}
              autoComplete="address-line1"
              required
              minLength={2}
              maxLength={200}
              placeholder="123 Rizal Street, Purok 2"
              defaultValue={defaultValue?.street ?? ""}
              className={invalidClassName}
            />
          </label>
          <FieldError id={`${id}-street-error`} message={errorFor(fieldNames.street)} />
        </div>
        <div className="min-w-0">
          <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-postal`}>
            Postal code <RequiredIndicator />
            <input
              id={`${id}-postal`}
              name={fieldNames.postalCode}
              {...describe(fieldNames.postalCode, "postal")}
              autoComplete="postal-code"
              inputMode="numeric"
              required
              pattern="\d{4}"
              maxLength={4}
              placeholder="4213"
              title="Enter a 4-digit postal code."
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              className={invalidClassName}
            />
          </label>
          <FieldError id={`${id}-postal-error`} message={errorFor(fieldNames.postalCode)} />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </fieldset>
  );
}
