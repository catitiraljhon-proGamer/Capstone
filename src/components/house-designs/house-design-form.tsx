"use client";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { PesoInput } from "@/components/ui/peso-input";
import { amountError, numberError, textError } from "@/lib/form-validation";
import {
  createDefaultSelections,
  formatPeso,
  getExteriorEstimate,
  isDataImage,
  normalizeSelections,
  type CustomExteriorItem,
  type ExteriorItemChoice,
  type HouseDesign,
  type HouseDesignFinish,
  type HouseDesignStatus,
  type HouseType,
  type MaterialPriceOverride,
} from "@/lib/house-design-data";
import {
  createCustomItemId,
  type NewHouseDesignInput,
} from "@/lib/house-design-store";
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
  | "rate"
  | "rooms"
  | "images"
  | "materialPrices"
  | "customItems";

type FieldErrors = Partial<Record<FieldName, string>>;

type FormValues = {
  name: string;
  houseType: string;
  area: string;
  rate: string;
  rooms: string;
};

const fieldOrder: FieldName[] = [
  "name",
  "houseType",
  "area",
  "rate",
  "rooms",
  "images",
  "materialPrices",
  "customItems",
];

const fieldLabels: Record<FieldName, string> = {
  name: "Design name",
  houseType: "House type",
  area: "Floor area",
  rate: "Cost rate",
  rooms: "Room setup",
  images: "Design images",
  materialPrices: "Material prices",
  customItems: "Custom exterior items",
};

const fieldIds: Record<FieldName, string> = {
  name: "design-name",
  houseType: "design-house-type",
  area: "design-area",
  rate: "design-rate",
  rooms: "design-rooms",
  images: "design-images",
  materialPrices: "design-material-prices",
  customItems: "design-custom-items",
};

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

const invalidInputClass = "border-red-600";

type MaterialPriceDraft = Omit<MaterialPriceOverride, "unitPrice"> & { unitPrice: string };

/** Quantity and unit price stay as typed text until the form is saved. */
type CustomItemDraft = Omit<CustomExteriorItem, "quantity" | "unitPrice"> & {
  quantity: string;
  unitPrice: string;
};

type CustomItemField = "item" | "material" | "unit" | "quantity" | "unitPrice";
type CustomItemErrors = Partial<Record<CustomItemField, string | null>>;

const maxUnitPrice = 100_000_000;

/** Same rule as the server: unit prices must be above zero, two decimals at most. */
function materialPriceError(price: MaterialPriceDraft) {
  return amountError(price.unitPrice, { label: `${price.item} unit price`, max: maxUnitPrice });
}

function isMaterialPriceValid(price: MaterialPriceDraft) {
  return materialPriceError(price) === null;
}

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

  const rateMessage = amountError(values.rate, { label: "Cost rate", max: maxUnitPrice });
  if (rateMessage) errors.rate = rateMessage;

  const roomsMessage = textError(values.rooms, { label: "Room setup", max: 200 });
  if (roomsMessage) {
    errors.rooms = values.rooms.trim()
      ? roomsMessage
      : "Describe the room setup, for example 3 bedrooms, 2 toilets.";
  }

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
  existingNames,
  houseTypes,
  finishes,
  exteriorItems,
  onCancel,
  onSubmit,
}: {
  /** Provide to edit an existing design; omit to create a new one. */
  design?: HouseDesign | null;
  defaultHouseType?: string | null;
  existingNames: string[];
  houseTypes: HouseType[];
  finishes: HouseDesignFinish[];
  exteriorItems: ExteriorItemChoice[];
  onCancel: () => void;
  onSubmit: (design: NewHouseDesignInput) => void;
}) {
  const isEditing = Boolean(design);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<FormValues>({
    name: design?.name ?? "",
    houseType: design?.houseType ?? defaultHouseType ?? "",
    area: design ? String(design.area) : "",
    rate: design ? String(design.rate) : "",
    rooms: design?.rooms ?? "",
  });
  const [style, setStyle] = useState(design?.style ?? "");
  const [finish, setFinish] = useState<HouseDesignFinish>(
    design?.finish ?? "Standard",
  );
  const [status, setStatus] = useState<HouseDesignStatus>(
    design?.status ?? "Draft",
  );
  const [notes, setNotes] = useState(design?.notes ?? "");
  const [images, setImages] = useState<string[]>(design?.images ?? []);
  const [selections, setSelections] = useState(() =>
    design
      ? normalizeSelections(design.defaultSelections, exteriorItems)
      : createDefaultSelections(exteriorItems),
  );
  const [customItems, setCustomItems] = useState<CustomItemDraft[]>(() =>
    (design?.customItems ?? []).map((item) => ({
      ...item,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  );
  const [submitted, setSubmitted] = useState(false);
  const [touchedItemFields, setTouchedItemFields] = useState<Record<string, boolean>>({});
  const [materialPriceDrafts, setMaterialPriceDrafts] = useState<MaterialPriceDraft[]>(() =>
    (design?.materialPrices ?? []).map((price) => ({ ...price, unitPrice: String(price.unitPrice) })),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showSummary, setShowSummary] = useState(false);

  const setValue = (field: keyof FormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const runValidation = (): FieldErrors => ({
    ...validate(values, images, customItems, existingNames),
    ...(materialPriceDrafts.some((price) => !isMaterialPriceValid(price)) ? {
      materialPrices: materialPriceDrafts.map(materialPriceError).find(Boolean) ?? "Fix the unit prices marked below.",
    } : {}),
  });

  const materialPrices: MaterialPriceOverride[] = materialPriceDrafts
    .filter(isMaterialPriceValid)
    .map((price) => ({ ...price, unitPrice: Number(price.unitPrice) }));

  const updateMaterialPrice = (itemIndex: number, unitPrice: string) => {
    const item = exteriorItems[itemIndex];
    const option = item.options[selections[itemIndex]];
    setMaterialPriceDrafts((current) => [
      ...current.filter((price) => !(price.item === item.item && price.material === option.name && price.unit === option.unit)),
      { item: item.item, material: option.name, unit: option.unit, unitPrice },
    ]);
  };

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
    if (field === "materialPrices") {
      const invalidPrice = materialPriceDrafts.find((price) => !isMaterialPriceValid(price));
      const itemIndex = exteriorItems.findIndex((item) => item.item === invalidPrice?.item);
      if (itemIndex >= 0 && invalidPrice) {
        const optionIndex = exteriorItems[itemIndex].options.findIndex((option) =>
          option.name === invalidPrice.material && option.unit === invalidPrice.unit,
        );
        if (optionIndex >= 0) {
          setSelections((current) => current.map((value, index) => index === itemIndex ? optionIndex : value));
          const input = document.getElementById(`material-${itemIndex}-price`);
          input?.focus();
          input?.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
      }
    }
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
  const rateValue = Number(values.rate);
  const preview = getExteriorEstimate(
    {
      area: Number.isFinite(areaValue) ? areaValue : 0,
      rate: Number.isFinite(rateValue) ? rateValue : 0,
      customItems: customItems.filter(isCustomItemComplete).map(toCustomItem),
      materialPrices,
    },
    selections,
    exteriorItems,
  );

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
      finish,
      area: areaValue,
      rooms: values.rooms.trim(),
      rate: rateValue,
      images,
      notes: notes.trim(),
      status,
      defaultSelections: selections,
      materialPrices,
      customItems: customItems.map(toCustomItem),
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
              ? "Update the design record, images, exterior materials, and custom items. Changes recalculate the estimate."
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
                  placeholder="Modern Courtyard"
                />
              </Field>

              <Field
                htmlFor={fieldIds.houseType}
                label={fieldLabels.houseType}
                hint="Controls which category card shows this design."
                required
                error={errors.houseType}
              >
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
              </Field>

              <Field
                htmlFor="design-style"
                label="Style label"
                hint="Optional. Defaults to the house type."
              >
                <input
                  id="design-style"
                  name="style"
                  className={inputClass}
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  aria-describedby="design-style-hint"
                  placeholder="Two-storey, corner lot"
                />
              </Field>

              <Field htmlFor="design-finish" label="Finish level">
                <select
                  id="design-finish"
                  name="finish"
                  className={inputClass}
                  value={finish}
                  onChange={(event) =>
                    setFinish(event.target.value as HouseDesignFinish)
                  }
                >
                  {finishes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                htmlFor={fieldIds.area}
                label="Floor area (sqm)"
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
                  placeholder="150"
                />
              </Field>

              <Field
                htmlFor={fieldIds.rate}
                label="Cost rate (PHP / sqm)"
                hint="Base estimate is floor area multiplied by this rate."
                required
                error={errors.rate}
              >
                <PesoInput
                  id={fieldIds.rate}
                  name="rate"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={values.rate}
                  onChange={(event) => setValue("rate", event.target.value)}
                  onBlur={() => handleBlur("rate")}
                  aria-invalid={Boolean(errors.rate)}
                  aria-describedby={describedBy(
                    fieldIds.rate,
                    true,
                    Boolean(errors.rate),
                  )}
                  placeholder="40000"
                />
              </Field>

              <Field
                htmlFor={fieldIds.rooms}
                label={fieldLabels.rooms}
                required
                error={errors.rooms}
              >
                <input
                  id={fieldIds.rooms}
                  name="rooms"
                  className={`${inputClass} ${errors.rooms ? invalidInputClass : ""}`}
                  value={values.rooms}
                  onChange={(event) => setValue("rooms", event.target.value)}
                  onBlur={() => handleBlur("rooms")}
                  aria-invalid={Boolean(errors.rooms)}
                  aria-describedby={describedBy(
                    fieldIds.rooms,
                    false,
                    Boolean(errors.rooms),
                  )}
                  placeholder="3 bedrooms, 2 toilets"
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
                  placeholder="Clean layout for subdivision-ready residential builds."
                />
              </Field>
            </div>
          </fieldset>

          <fieldset id={fieldIds.materialPrices} tabIndex={-1} className="min-w-0 rounded-xl border border-stone-200 p-5">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Default Exterior Materials
            </legend>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Choose each material type and update its unit price as costs change.
              Prices are saved for this house design when you save your changes.
            </p>
            <div className="mt-4 space-y-5">
              {exteriorItems.map((item, itemIndex) => {
                const id = `material-${itemIndex}`;
                const option = item.options[selections[itemIndex]];
                const priceDraft = materialPriceDrafts.find((price) =>
                  price.item === item.item && price.material === option.name && price.unit === option.unit,
                );
                const priceMessage = errors.materialPrices && priceDraft ? materialPriceError(priceDraft) : null;

                return (
                  <div key={item.item} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end">
                    <Field htmlFor={id} label={`${item.item} type`} hint={item.detail}>
                    <select
                      id={id}
                      className={inputClass}
                      value={selections[itemIndex]}
                      aria-describedby={`${id}-hint`}
                      onChange={(event) =>
                        setSelections((current) =>
                          current.map((value, index) =>
                            index === itemIndex
                              ? Number(event.target.value)
                              : value,
                          ),
                        )
                      }
                    >
                      {item.options.map((option, optionIndex) => (
                        <option key={option.name} value={optionIndex}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    </Field>
                    <Field
                      htmlFor={`${id}-price`}
                      label={`Price (PHP / ${option.unit})`}
                      error={priceMessage ?? undefined}
                    >
                      <PesoInput
                        id={`${id}-price`}
                        aria-label={`${item.item} unit price (PHP / ${option.unit})`}
                        inputMode="decimal"
                        min="0.01"
                        max="100000000"
                        step="0.01"
                        required
                        value={priceDraft?.unitPrice ?? String(option.unitPrice)}
                        onChange={(event) => updateMaterialPrice(itemIndex, event.target.value)}
                        onBlur={() => handleBlur("materialPrices")}
                        aria-invalid={Boolean(priceMessage)}
                        aria-describedby={priceMessage ? `${id}-price-error` : undefined}
                      />
                    </Field>
                    {priceDraft && <button
                      type="button"
                      onClick={() => setMaterialPriceDrafts((current) => current.filter((price) =>
                        !(price.item === item.item && price.material === option.name && price.unit === option.unit),
                      ))}
                      className="justify-self-start text-xs font-medium text-red-700 underline underline-offset-4 hover:text-red-800 sm:col-span-2"
                      aria-label={`Reset ${item.item} price to catalog price`}
                    >Use catalog price: {formatPeso(option.unitPrice)} / {option.unit}</button>}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-stone-200 p-5">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Custom Exterior Items
            </legend>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Add exterior work that is not in the standard list, such as
              perimeter fencing or a carport canopy. Each item is added to the
              estimate.
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
                          label="Item name"
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
                            placeholder="Perimeter fence"
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
                            placeholder="CHB with steel gate"
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
                            placeholder="sqm, lm, set"
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
                          label="Unit price (PHP)"
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
                  The seven standard exterior items already apply to this design.
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
              Add custom item
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
                          Main image
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
              {images.length > 0 ? "Add more images" : "Upload design images"}
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
              {formatPeso(preview.revisedEstimate)}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-600">Base estimate</dt>
                <dd className="font-medium tabular-nums">
                  {formatPeso(preview.baseEstimate)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-600">Exterior materials</dt>
                <dd className="font-medium tabular-nums">
                  {formatPeso(preview.exteriorTotal)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-stone-600">
              Computed from floor area, cost rate, standard materials, and any
              completed custom items.
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
