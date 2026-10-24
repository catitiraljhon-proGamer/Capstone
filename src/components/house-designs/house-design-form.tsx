"use client";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { PesoInput } from "@/components/ui/peso-input";
import { maxRoomCount } from "@/lib/design-request-limit";
import { amountError, numberError, textError } from "@/lib/form-validation";
import {
  formatPeso,
  getDesignEstimate,
  isDataImage,
  type CustomExteriorItem,
  type HouseDesign,
  type HouseDesignStatus,
  type HouseType,
} from "@/lib/house-design-data";
import {
  createCustomItemId,
  type NewHouseDesignInput,
} from "@/lib/house-design-store";
import type { ManagedProfessional } from "@/lib/professionals";
import { AlertCircle, ImagePlus, Plus, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

const maxImageBytes = 1_500_000;
const maxImages = 6;

type FieldName =
  | "name"
  | "houseType"
  | "area"
  | "cost"
  | "bedrooms"
  | "bathrooms"
  | "images"
  | "customItems";

type FieldErrors = Partial<Record<FieldName, string>>;

type FormValues = {
  name: string;
  houseType: string;
  area: string;
  cost: string;
  bedrooms: string;
  bathrooms: string;
};

const fieldOrder: FieldName[] = [
  "name",
  "houseType",
  "area",
  "cost",
  "bedrooms",
  "bathrooms",
  "images",
  "customItems",
];

const fieldLabels: Record<FieldName, string> = {
  name: "Design Name",
  houseType: "House Type",
  area: "Floor Area",
  cost: "Estimated Project Cost",
  bedrooms: "Bedrooms",
  bathrooms: "Bathrooms",
  images: "Design Images",
  customItems: "Custom Exterior Items",
};

const fieldIds: Record<FieldName, string> = {
  name: "design-name",
  houseType: "design-house-type",
  area: "design-area",
  cost: "design-cost",
  bedrooms: "design-bedrooms",
  bathrooms: "design-bathrooms",
  images: "design-images",
  customItems: "design-custom-items",
};

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

const invalidInputClass = "border-red-600";

/** Quantity and unit price stay as typed text until the form is saved. */
type CustomItemDraft = Omit<CustomExteriorItem, "quantity" | "unitPrice"> & {
  quantity: string;
  unitPrice: string;
};

type CustomItemField = "item" | "material" | "unit" | "quantity" | "unitPrice";
type CustomItemErrors = Partial<Record<CustomItemField, string | null>>;

const maxProjectCost = 10_000_000_000;

function customItemErrors(item: CustomItemDraft): CustomItemErrors {
  return {
    item: textError(item.item, { label: "Item name", max: 120 }),
    material: textError(item.material, { label: "Material", max: 160 }),
    unit: textError(item.unit, { label: "Unit", max: 30 }),
    quantity:
      numberError(item.quantity, { label: "Quantity" }) ??
      (Number(item.quantity) <= 0 ? "Quantity must be more than 0." : null),
    unitPrice: amountError(item.unitPrice, { label: "Unit price", allowZero: true }),
  };
}

function isCustomItemComplete(item: CustomItemDraft) {
  return Object.values(customItemErrors(item)).every((message) => !message);
}

function toCustomItem(item: CustomItemDraft): CustomExteriorItem {
  return {
    ...item,
    item: item.item.trim(),
    material: item.material.trim(),
    unit: item.unit.trim(),
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
  };
}

function validate(
  values: FormValues,
  images: string[],
  customItems: CustomItemDraft[],
  existingNames: string[],
): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedName = values.name.trim();

  const nameMessage = textError(values.name, { label: "Design name", min: 2, max: 120 });
  if (nameMessage) {
    errors.name = nameMessage;
  } else if (
    existingNames.some(
      (existing) => existing.toLowerCase() === trimmedName.toLowerCase(),
    )
  ) {
    errors.name = "A design with this name already exists. Use a unique name.";
  }

  if (!values.houseType) {
    errors.houseType = "Select a house type so customers can find this design.";
  }

  const areaMessage =
    numberError(values.area, { label: "Floor area", max: 100_000, unit: " sq m" }) ??
    (Number(values.area) <= 0 ? "Floor area must be more than 0 sq m." : null);
  if (areaMessage) errors.area = areaMessage;

  const costMessage = amountError(values.cost, { label: "Estimated project cost", max: maxProjectCost });
  if (costMessage) errors.cost = costMessage;

  const bedroomsMessage = numberError(values.bedrooms, { label: "Number of bedrooms", integer: true, min: 0, max: maxRoomCount });
  if (bedroomsMessage) errors.bedrooms = bedroomsMessage;

  const bathroomsMessage = numberError(values.bathrooms, { label: "Number of bathrooms", integer: true, min: 0, max: maxRoomCount });
  if (bathroomsMessage) errors.bathrooms = bathroomsMessage;

  if (images.length === 0) {
    errors.images = "Upload at least one design image.";
  }

  if (customItems.some((item) => !isCustomItemComplete(item))) {
    errors.customItems =
      "Complete every custom item, or remove the unfinished rows.";
  }

  return errors;
}

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-red-700">
        *
      </span>
      <span className="sr-only">(required)</span>
    </>
  );
}

function Field({
  htmlFor,
  label,
  hint,
  error,
  required = false,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-stone-950"
      >
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1 text-xs leading-5 text-stone-600">
          {hint}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
      {error ? <FieldError id={`${htmlFor}-error`} message={error} /> : null}
    </div>
  );
}

function describedBy(id: string, hasHint: boolean, hasError: boolean) {
  const ids = [hasHint ? `${id}-hint` : null, hasError ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return ids || undefined;
}

export function HouseDesignForm({
  design,
  defaultHouseType,
  houseTypes,
  professionals,
  existingNames,
  onCancel,
  onSubmit,
}: {
  /** Provide to edit an existing design; omit to create a new one. */
  design?: HouseDesign | null;
  defaultHouseType?: string | null;
  houseTypes: HouseType[];
  /** The architects and engineers a design can be credited to (Maintenance > Architects and Engineers). */
  professionals: ManagedProfessional[];
  existingNames: string[];
  onCancel: () => void;
  onSubmit: (design: NewHouseDesignInput) => void;
}) {
  const isEditing = Boolean(design);
  // A design added from inside a house type belongs to that type; editing keeps the choice so a design can be moved.
  const fixedHouseType = !isEditing && defaultHouseType ? defaultHouseType : null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<FormValues>({
    name: design?.name ?? "",
    houseType: design?.houseType ?? defaultHouseType ?? "",
    area: design ? String(design.area) : "",
    cost: design ? String(getDesignEstimate({ area: design.area, rate: design.rate }).baseEstimate) : "",
    bedrooms: design ? String(design.bedrooms) : "",
    bathrooms: design ? String(design.bathrooms) : "",
  });
  const [style, setStyle] = useState(design?.style ?? "");
  const [status, setStatus] = useState<HouseDesignStatus>(
    design?.status ?? "Draft",
  );
  const [notes, setNotes] = useState(design?.notes ?? "");
  const [designedBy, setDesignedBy] = useState(design?.designedBy ?? "");
  const [images, setImages] = useState<string[]>(design?.images ?? []);
  const [customItems, setCustomItems] = useState<CustomItemDraft[]>(() =>
    (design?.customItems ?? []).map((item) => ({
      ...item,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  );
  const [submitted, setSubmitted] = useState(false);
  const [touchedItemFields, setTouchedItemFields] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showSummary, setShowSummary] = useState(false);

  const setValue = (field: keyof FormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const runValidation = (): FieldErrors =>
    validate(values, images, customItems, existingNames);

  const touchItemField = (id: string, field: CustomItemField) =>
    setTouchedItemFields((current) => (current[`${id}-${field}`] ? current : { ...current, [`${id}-${field}`]: true }));

  /** A custom item field's message, shown after it was left or a save was attempted. */
  const itemError = (item: CustomItemDraft, field: CustomItemField) =>
    submitted || touchedItemFields[`${item.id}-${field}`] ? customItemErrors(item)[field] ?? null : null;

  const itemFieldProps = (item: CustomItemDraft, field: CustomItemField) => {
    const message = itemError(item, field);
    return {
      onBlur: () => touchItemField(item.id, field),
      "aria-invalid": message ? true : undefined,
      "aria-describedby": message ? `${item.id}-${field === "unitPrice" ? "price" : field}-error` : undefined,
    } as const;
  };

  /** Validate on blur so errors appear after the user finishes a field. */
  const handleBlur = (field: FieldName) =>
    setErrors((current) => ({ ...current, [field]: runValidation()[field] }));

  const focusField = (field: FieldName) => {
    // Custom items have per-row ids, so aim at the first incomplete row.
    const invalidItem = customItems.find((item) => !isCustomItemComplete(item));
    const invalidItemField = invalidItem
      ? (Object.entries(customItemErrors(invalidItem)).find(([, message]) => message)?.[0] as CustomItemField | undefined)
      : undefined;
    const targetId =
      field === "customItems"
        ? `${invalidItem?.id ?? ""}-${invalidItemField === "unitPrice" ? "price" : invalidItemField ?? "item"}`
        : fieldIds[field];
    const element =
      document.getElementById(targetId) ??
      document.getElementById(fieldIds.customItems);

    element?.focus();
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const areaValue = Number(values.area);
  const costValue = Number.isFinite(Number(values.cost)) ? Number(values.cost) : 0;
  // The Admin keeps the project cost current; the per-sqm rate is worked out from it and the floor area.
  const rateValue = Number.isFinite(areaValue) && areaValue > 0 ? costValue / areaValue : 0;
  const { customTotal } = getDesignEstimate({
    area: 0,
    rate: 0,
    customItems: customItems.filter(isCustomItemComplete).map(toCustomItem),
  });
  const preview = { baseEstimate: costValue, customTotal, estimate: Math.round((costValue + customTotal) * 100) / 100 };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      setErrors((current) => ({
        ...current,
        images: `You can upload up to ${maxImages} images.`,
      }));
      return;
    }

    const oversized = files.find((file) => file.size > maxImageBytes);
    if (oversized) {
      setErrors((current) => ({
        ...current,
        images: `"${oversized.name}" is larger than 1.5 MB. Compress it and try again.`,
      }));
      return;
    }

    const accepted = files.slice(0, remainingSlots);
    Promise.all(
      accepted.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          }),
      ),
    ).then((dataUrls) => {
      const valid = dataUrls.filter(Boolean);
      setImages((current) => [...current, ...valid].slice(0, maxImages));
      setErrors((current) => ({
        ...current,
        images:
          files.length > remainingSlots
            ? `Only ${remainingSlots} more image(s) could be added. Limit is ${maxImages}.`
            : undefined,
      }));
    });
  };

  const removeImage = (index: number) =>
    setImages((current) => current.filter((_, position) => position !== index));

  const makeCover = (index: number) =>
    setImages((current) => [
      current[index],
      ...current.filter((_, position) => position !== index),
    ]);

  const addCustomItem = () =>
    setCustomItems((current) => [
      ...current,
      {
        id: createCustomItemId(),
        item: "",
        material: "",
        unit: "sqm",
        quantity: "1",
        unitPrice: "",
      },
    ]);

  const updateCustomItem = (
    id: string,
    changes: Partial<CustomItemDraft>,
  ) =>
    setCustomItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );

  const removeCustomItem = (id: string) =>
    setCustomItems((current) => current.filter((item) => item.id !== id));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSubmitted(true);
    const nextErrors = runValidation();
    const invalidFields = fieldOrder.filter((field) => nextErrors[field]);

    setErrors(nextErrors);
    setShowSummary(invalidFields.length > 1);

    if (invalidFields.length > 0) {
      focusField(invalidFields[0]);
      return;
    }

    onSubmit({
      name: values.name.trim(),
      style: style.trim() || undefined,
      houseType: values.houseType,
      area: areaValue,
      bedrooms: Number(values.bedrooms),
      bathrooms: Number(values.bathrooms),
      rate: rateValue,
      images,
      notes: notes.trim(),
      status,
      customItems: customItems.map(toCustomItem),
      designedBy: designedBy || null,
    });
  };

  const summaryFields = showSummary
    ? fieldOrder.filter((field) => errors[field])
    : [];

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-stone-950">
            {isEditing ? `Edit ${design?.name}` : "Add New House Design"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            {isEditing
              ? "Update the design record, images, and custom items. Changes recalculate the estimate."
              : "Designs are saved as a draft first. Publish when the design is ready for customers to browse."}
          </p>
        </div>
        <BackButton type="button" onClick={onCancel} />
      </div>

      {summaryFields.length > 0 ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-100 bg-red-50 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {summaryFields.length} fields need attention
          </p>
          <ul className="mt-2 space-y-1">
            {summaryFields.map((field) => (
              <li key={field}>
                <button
                  type="button"
                  onClick={() => focusField(field)}
                  className="text-left text-sm font-medium text-red-800 underline underline-offset-4 hover:text-red-950"
                >
                  {fieldLabels[field]}: {errors[field]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <fieldset className="rounded-xl border border-stone-200 p-5">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Design Record
            </legend>
            <div className="mt-2 grid gap-5 sm:grid-cols-2">
              <Field
                htmlFor={fieldIds.name}
                label={fieldLabels.name}
                required
                error={errors.name}
              >
                <input
                  id={fieldIds.name}
                  name="name"
                  className={`${inputClass} ${errors.name ? invalidInputClass : ""}`}
                  value={values.name}
                  onChange={(event) => setValue("name", event.target.value)}
                  onBlur={() => handleBlur("name")}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={describedBy(
                    fieldIds.name,
                    false,
                    Boolean(errors.name),
                  )}
                  placeholder="Enter design name"
                />
              </Field>

              <Field
                htmlFor={fieldIds.houseType}
                label={fieldLabels.houseType}
                hint={fixedHouseType
                  ? "Set by the house type you opened."
                  : "Controls which category card shows this design."}
                required
                error={errors.houseType}
              >
                {fixedHouseType ? (
                  <input
                    id={fieldIds.houseType}
                    name="houseType"
                    readOnly
                    className={`${inputClass} cursor-default bg-stone-50 font-medium focus:border-stone-200 focus:ring-0`}
                    value={fixedHouseType}
                    aria-describedby={`${fieldIds.houseType}-hint`}
                  />
                ) : (
                  <select
                    id={fieldIds.houseType}
                    name="houseType"
                    className={`${inputClass} ${errors.houseType ? invalidInputClass : ""}`}
                    value={values.houseType}
                    onChange={(event) => setValue("houseType", event.target.value)}
                    onBlur={() => handleBlur("houseType")}
                    aria-invalid={Boolean(errors.houseType)}
                    aria-describedby={describedBy(
                      fieldIds.houseType,
                      true,
                      Boolean(errors.houseType),
                    )}
                  >
                    <option value="">Select a house type</option>
                    {houseTypes.map((type) => (
                      <option key={type.heading} value={type.heading}>
                        {type.heading}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field
                htmlFor="design-style"
                label="Style Label"
                hint="Optional. Defaults to the house type."
              >
                <input
                  id="design-style"
                  name="style"
                  className={inputClass}
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  aria-describedby="design-style-hint"
                  placeholder="Enter style label"
                />
              </Field>

              <Field
                htmlFor={fieldIds.area}
                label="Floor Area (sqm)"
                required
                error={errors.area}
              >
                <input
                  id={fieldIds.area}
                  name="area"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  className={`${inputClass} tabular-nums ${errors.area ? invalidInputClass : ""}`}
                  value={values.area}
                  onChange={(event) => setValue("area", event.target.value)}
                  onBlur={() => handleBlur("area")}
                  aria-invalid={Boolean(errors.area)}
                  aria-describedby={describedBy(
                    fieldIds.area,
                    false,
                    Boolean(errors.area),
                  )}
                  placeholder="Enter floor area"
                />
              </Field>

              <Field
                htmlFor={fieldIds.cost}
                label="Estimated Project Cost (PHP)"
                hint={
                  rateValue > 0
                    ? `Update it as material and labor prices change. Works out to ${formatPeso(Math.round(rateValue * 100) / 100)} per sqm.`
                    : "Update it as material and labor prices change."
                }
                required
                error={errors.cost}
              >
                <PesoInput
                  id={fieldIds.cost}
                  name="cost"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={values.cost}
                  onChange={(event) => setValue("cost", event.target.value)}
                  onBlur={() => handleBlur("cost")}
                  aria-invalid={Boolean(errors.cost)}
                  aria-describedby={describedBy(
                    fieldIds.cost,
                    true,
                    Boolean(errors.cost),
                  )}
                  placeholder="Enter estimated project cost"
                />
              </Field>

              <Field
                htmlFor={fieldIds.bedrooms}
                label={fieldLabels.bedrooms}
                required
                error={errors.bedrooms}
              >
                <input
                  id={fieldIds.bedrooms}
                  name="bedrooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={maxRoomCount}
                  step="1"
                  className={`${inputClass} tabular-nums ${errors.bedrooms ? invalidInputClass : ""}`}
                  value={values.bedrooms}
                  onChange={(event) => setValue("bedrooms", event.target.value)}
                  onBlur={() => handleBlur("bedrooms")}
                  aria-invalid={Boolean(errors.bedrooms)}
                  aria-describedby={describedBy(
                    fieldIds.bedrooms,
                    false,
                    Boolean(errors.bedrooms),
                  )}
                  placeholder="Enter number of bedrooms"
                />
              </Field>

              <Field
                htmlFor={fieldIds.bathrooms}
                label={fieldLabels.bathrooms}
                required
                error={errors.bathrooms}
              >
                <input
                  id={fieldIds.bathrooms}
                  name="bathrooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={maxRoomCount}
                  step="1"
                  className={`${inputClass} tabular-nums ${errors.bathrooms ? invalidInputClass : ""}`}
                  value={values.bathrooms}
                  onChange={(event) => setValue("bathrooms", event.target.value)}
                  onBlur={() => handleBlur("bathrooms")}
                  aria-invalid={Boolean(errors.bathrooms)}
                  aria-describedby={describedBy(
                    fieldIds.bathrooms,
                    false,
                    Boolean(errors.bathrooms),
                  )}
                  placeholder="Enter number of bathrooms"
                />
              </Field>

              <Field
                htmlFor="design-status"
                label="Status"
                hint="Drafts stay hidden from customers."
              >
                <select
                  id="design-status"
                  name="status"
                  className={inputClass}
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as HouseDesignStatus)
                  }
                  aria-describedby="design-status-hint"
                >
                  <option value="Draft">Draft</option>
                  <option value="Published">Published</option>
                  {isEditing ? <option value="Archived">Archived</option> : null}
                </select>
              </Field>

              <Field
                htmlFor="design-designed-by"
                label="Designed By"
                hint="Optional. The About Us page lists the design under this person once it is published."
              >
                <select
                  id="design-designed-by"
                  name="designedBy"
                  className={inputClass}
                  value={designedBy}
                  onChange={(event) => setDesignedBy(event.target.value)}
                  aria-describedby="design-designed-by-hint"
                >
                  <option value="">Not set</option>
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      {professional.name} ({professional.role}){professional.visible ? "" : ", hidden"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-5">
              <Field
                htmlFor="design-notes"
                label="Notes"
                hint="Optional short description shown on the design details screen."
              >
                <textarea
                  id="design-notes"
                  name="notes"
                  rows={3}
                  className={`${inputClass} resize-none`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  aria-describedby="design-notes-hint"
                  placeholder="Enter notes"
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-stone-200 p-5">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Custom Exterior Items
            </legend>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Add exterior work for this design, such as perimeter fencing or a
              carport canopy. Each item is added to the estimate. Customers
              suggest other items when they request the design.
            </p>

            {customItems.length > 0 ? (
              <ul className="mt-4 space-y-4">
                {customItems.map((item, index) => {
                  const incomplete =
                    (submitted || Boolean(errors.customItems)) && !isCustomItemComplete(item);

                  return (
                    <li
                      key={item.id}
                      className={[
                        "rounded-lg border p-4",
                        incomplete ? "border-red-600 bg-red-50/40" : "border-stone-200",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-950">
                          Custom item {index + 1}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCustomItem(item.id)}
                          aria-label={`Remove custom item ${index + 1}`}
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Remove
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <Field
                          htmlFor={`${item.id}-item`}
                          label="Item Name"
                          required
                          error={itemError(item, "item") ?? undefined}
                        >
                          <input
                            id={`${item.id}-item`}
                            className={`${inputClass} aria-invalid:border-red-600`}
                            {...itemFieldProps(item, "item")}
                            value={item.item}
                            onChange={(event) =>
                              updateCustomItem(item.id, {
                                item: event.target.value,
                              })
                            }
                            placeholder="Enter item name"
                          />
                        </Field>
                        <Field
                          htmlFor={`${item.id}-material`}
                          label="Material"
                          required
                          error={itemError(item, "material") ?? undefined}
                        >
                          <input
                            id={`${item.id}-material`}
                            className={`${inputClass} aria-invalid:border-red-600`}
                            {...itemFieldProps(item, "material")}
                            value={item.material}
                            onChange={(event) =>
                              updateCustomItem(item.id, {
                                material: event.target.value,
                              })
                            }
                            placeholder="Enter material"
                          />
                        </Field>
                        <Field
                          htmlFor={`${item.id}-unit`}
                          label="Unit"
                          required
                          error={itemError(item, "unit") ?? undefined}
                        >
                          <input
                            id={`${item.id}-unit`}
                            className={`${inputClass} aria-invalid:border-red-600`}
                            {...itemFieldProps(item, "unit")}
                            value={item.unit}
                            onChange={(event) =>
                              updateCustomItem(item.id, {
                                unit: event.target.value,
                              })
                            }
                            placeholder="Enter unit"
                          />
                        </Field>
                        <Field
                          htmlFor={`${item.id}-quantity`}
                          label="Quantity"
                          required
                          error={itemError(item, "quantity") ?? undefined}
                        >
                          <input
                            id={`${item.id}-quantity`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            className={`${inputClass} tabular-nums aria-invalid:border-red-600`}
                            {...itemFieldProps(item, "quantity")}
                            value={item.quantity}
                            onChange={(event) =>
                              updateCustomItem(item.id, {
                                quantity: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field
                          htmlFor={`${item.id}-price`}
                          label="Unit Price (PHP)"
                          required
                          error={itemError(item, "unitPrice") ?? undefined}
                        >
                          <PesoInput
                            id={`${item.id}-price`}
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            {...itemFieldProps(item, "unitPrice")}
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateCustomItem(item.id, {
                                unitPrice: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <div className="self-end rounded-lg border border-stone-200 px-3 py-2.5">
                          <p className="text-xs font-semibold uppercase text-stone-500">
                            Amount
                          </p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-stone-950">
                            {formatPeso(
                              (Number.isFinite(Number(item.quantity))
                                ? Number(item.quantity)
                                : 0) *
                                (Number.isFinite(Number(item.unitPrice))
                                  ? Number(item.unitPrice)
                                  : 0),
                            )}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-stone-200 p-6 text-center">
                <p className="text-sm font-semibold text-stone-950">
                  No custom items yet.
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-stone-600">
                  The estimate is the Estimated Project Cost above.
                </p>
              </div>
            )}

            {errors.customItems ? (
              <FieldError
                id={`${fieldIds.customItems}-error`}
                message={errors.customItems}
              />
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={addCustomItem}
              id={customItems.length === 0 ? fieldIds.customItems : undefined}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add Custom Item
            </Button>
          </fieldset>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-stone-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Design Images
              <RequiredMark />
            </h2>
            <p className="mt-2 text-xs leading-5 text-stone-600">
              Up to {maxImages} images, 1.5 MB each. The first image is the cover
              shown on cards.
            </p>

            {images.length > 0 ? (
              <ul className="mt-4 grid grid-cols-2 gap-3">
                {images.map((imageSrc, index) => (
                  <li
                    key={`${imageSrc.slice(0, 40)}-${index}`}
                    className="overflow-hidden rounded-lg border border-stone-200"
                  >
                    <div className="relative h-24 bg-stone-100">
                      <Image
                        src={imageSrc}
                        alt={`Design image ${index + 1}`}
                        fill
                        unoptimized={isDataImage(imageSrc)}
                        className="object-cover"
                        sizes="160px"
                      />
                      {index === 0 ? (
                        <span className="absolute left-1 top-1 rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Cover
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-1 px-1 py-1">
                      {index === 0 ? (
                        <span className="px-1 text-[11px] text-stone-600">
                          Main Image
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="px-2 text-[11px]"
                          onClick={() => makeCover(index)}
                          aria-label={`Make image ${index + 1} the cover`}
                        >
                          <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                          Cover
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-2 text-[11px] text-red-700 hover:bg-red-50"
                        onClick={() => removeImage(index)}
                        aria-label={`Remove image ${index + 1}`}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <input
              ref={fileInputRef}
              name="images"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={handleImageChange}
            />
            <Button
              type="button"
              id={fieldIds.images}
              variant="outline"
              className="mt-4 w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= maxImages}
              aria-invalid={Boolean(errors.images)}
              aria-describedby={describedBy(
                fieldIds.images,
                false,
                Boolean(errors.images),
              )}
            >
              <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
              {images.length > 0 ? "Add More Images" : "Upload Design Images"}
            </Button>

            {errors.images ? (
              <FieldError
                id={`${fieldIds.images}-error`}
                message={errors.images}
              />
            ) : null}
          </section>

          <section className="rounded-xl border border-stone-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Estimate Preview
            </h2>
            <p
              aria-live="polite"
              className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-red-700"
            >
              {formatPeso(preview.estimate)}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-600">Project Cost</dt>
                <dd className="font-medium tabular-nums">
                  {formatPeso(preview.baseEstimate)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-600">Custom Items</dt>
                <dd className="font-medium tabular-nums">
                  {formatPeso(preview.customTotal)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-stone-600">
              The Estimated Project Cost plus any completed custom items.
            </p>
          </section>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {isEditing ? "Save Changes" : "Save Design"}
        </Button>
      </div>
    </form>
  );
}
