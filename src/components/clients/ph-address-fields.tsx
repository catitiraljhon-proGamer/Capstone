"use client";

import { RequiredIndicator } from "@/components/ui/required-indicator";
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

type PhAddressFieldsProps = {
  defaultValue?: AddressDetails | null;
  /** Text address saved before the dropdowns existed, shown as a reminder. */
  legacyAddress?: string;
  inputClassName: string;
  labelClassName: string;
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
  const selectClassName = `${inputClassName} disabled:cursor-not-allowed disabled:opacity-60`;

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
        <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-province`}>
          Province <RequiredIndicator />
          <select
            id={`${id}-province`}
            name={fieldNames.provinceCode}
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
        <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-city`}>
          City / municipality <RequiredIndicator />
          <select
            id={`${id}-city`}
            name={fieldNames.cityCode}
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
        <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-barangay`}>
          Barangay <RequiredIndicator />
          <select
            id={`${id}-barangay`}
            name={fieldNames.barangayCode}
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
      </div>
      <input type="hidden" name={fieldNames.barangay} value={barangay?.name ?? ""} />
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-street`}>
          House no. / street <RequiredIndicator />
          <input
            id={`${id}-street`}
            name={fieldNames.street}
            autoComplete="address-line1"
            required
            minLength={2}
            maxLength={200}
            placeholder="123 Rizal Street, Purok 2"
            defaultValue={defaultValue?.street ?? ""}
            className={inputClassName}
          />
        </label>
        <label className={`min-w-0 ${labelClassName}`} htmlFor={`${id}-postal`}>
          Postal code <RequiredIndicator />
          <input
            id={`${id}-postal`}
            name={fieldNames.postalCode}
            autoComplete="postal-code"
            inputMode="numeric"
            required
            pattern="\d{4}"
            maxLength={4}
            placeholder="4213"
            title="Enter a 4-digit postal code."
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            className={inputClassName}
          />
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </fieldset>
  );
}
