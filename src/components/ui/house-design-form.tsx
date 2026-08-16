"use client";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { houseTypes } from "@/components/ui/color-change-card";
import {
  createDefaultSelections,
  exteriorItemChoices,
  formatPeso,
  getExteriorEstimate,
  houseDesignFinishes,
  isDataImage,
  normalizeSelections,
  type CustomExteriorItem,
  type HouseDesign,
  type HouseDesignFinish,
  type HouseDesignStatus,
} from "@/components/ui/house-design-data";
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
  "customItems",
];

const fieldLabels: Record<FieldName, string> = {
  name: "Design name",
  houseType: "House type",
  area: "Floor area",
  rate: "Cost rate",
  rooms: "Room setup",
  images: "Design images",
  customItems: "Custom exterior items",
};

const fieldIds: Record<FieldName, string> = {
  name: "design-name",
  houseType: "design-house-type",
  area: "design-area",
  rate: "design-rate",
  rooms: "design-rooms",
  images: "design-images",
  customItems: "design-custom-items",
};

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

const invalidInputClass = "border-red-600";

function isCustomItemComplete(item: CustomExteriorItem) {
  return (
    item.item.trim().length > 0 &&
    item.material.trim().length > 0 &&
    item.unit.trim().length > 0 &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    Number.isFinite(item.unitPrice) &&
    item.unitPrice > 0
  );
}

function validate(
  values: FormValues,
  images: string[],
  customItems: CustomExteriorItem[],
  existingNames: string[],
): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedName = values.name.trim();
  const areaValue = Number(values.area);
  const rateValue = Number(values.rate);

  if (!trimmedName) {
    errors.name = "Design name is required.";
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

  if (!values.area.trim() || !Number.isFinite(areaValue) || areaValue <= 0) {
    errors.area = "Enter a floor area greater than 0.";
  }

  if (!values.rate.trim() || !Number.isFinite(rateValue) || rateValue <= 0) {
    errors.rate = "Enter a cost rate greater than 0.";
  }

  if (!values.rooms.trim()) {
    errors.rooms = "Describe the room setup, for example 3 bedrooms, 2 toilets.";
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

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-700"
    >
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
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
  onCancel,
  onSubmit,
}: {
  /** Provide to edit an existing design; omit to create a new one. */
  design?: HouseDesign | null;
  defaultHouseType?: string | null;
  existingNames: string[];
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
    design ? normalizeSelections(design.defaultSelections) : createDefaultSelections(),
  );
  const [customItems, setCustomItems] = useState<CustomExteriorItem[]>(
    design?.customItems ?? [],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showSummary, setShowSummary] = useState(false);

  const setValue = (field: keyof FormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const runValidation = () =>
    validate(values, images, customItems, existingNames);

  /** Validate on blur so errors appear after the user finishes a field. */
  const handleBlur = (field: FieldName) =>
    setErrors((current) => ({ ...current, [field]: runValidation()[field] }));

  const focusField = (field: FieldName) => {
    // Custom items have per-row ids, so aim at the first incomplete row.
    const targetId =
      field === "customItems"
        ? `${customItems.find((item) => !isCustomItemComplete(item))?.id ?? ""}-item`
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
      customItems: customItems.filter(isCustomItemComplete),
    },
    selections,
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
        quantity: 1,
        unitPrice: 0,
      },
    ]);

  const updateCustomItem = (
    id: string,
    changes: Partial<CustomExteriorItem>,
  ) =>
    setCustomItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );

  const removeCustomItem = (id: string) =>
    setCustomItems((current) => current.filter((item) => item.id !== id));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
      customItems: customItems.map((item) => ({
        ...item,
        item: item.item.trim(),
        material: item.material.trim(),
        unit: item.unit.trim(),
      })),
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
                  {houseDesignFinishes.map((option) => (
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
                  inputMode="numeric"
                  min="1"
                  step="1"
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
                <input
                  id={fieldIds.rate}
                  name="rate"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="500"
                  className={`${inputClass} tabular-nums ${errors.rate ? invalidInputClass : ""}`}
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

          <fieldset className="rounded-xl border border-stone-200 p-5">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Default Exterior Materials
            </legend>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              These become the starting material set whenever this design is
              opened.
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {exteriorItemChoices.map((item, itemIndex) => {
                const id = `material-${itemIndex}`;

                return (
                  <Field
                    key={item.item}
                    htmlFor={id}
                    label={item.item}
                    hint={item.detail}
                  >
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
                          {option.name} - {formatPeso(option.unitPrice)}/
                          {option.unit}
                        </option>
                      ))}
                    </select>
                  </Field>
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
                    Boolean(errors.customItems) && !isCustomItemComplete(item);

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
                        >
                          <input
                            id={`${item.id}-item`}
                            className={inputClass}
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
                        >
                          <input
                            id={`${item.id}-material`}
                            className={inputClass}
                            value={item.material}
                            onChange={(event) =>
                              updateCustomItem(item.id, {
                                material: event.target.value,
                              })
                            }
                            placeholder="CHB with steel gate"
                          />
                        </Field>
                        <Field htmlFor={`${item.id}-unit`} label="Unit" required>
                          <input
                            id={`${item.id}-unit`}
                            className={inputClass}
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
                        >
                          <input
                            id={`${item.id}-quantity`}
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            className={`${inputClass} tabular-nums`}
                            value={item.quantity}
                            onChange={(event) =>
                              updateCustomItem(item.id, {
                                quantity: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field
                          htmlFor={`${item.id}-price`}
                          label="Unit price (PHP)"
                          required
                        >
                          <input
                            id={`${item.id}-price`}
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="100"
                            className={`${inputClass} tabular-nums`}
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateCustomItem(item.id, {
                                unitPrice: Number(event.target.value),
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
                              (Number.isFinite(item.quantity)
                                ? item.quantity
                                : 0) *
                                (Number.isFinite(item.unitPrice)
                                  ? item.unitPrice
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
