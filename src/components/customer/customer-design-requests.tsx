"use client";

import {
  countOpenDesignRequests,
  designRequestLimitMessage,
  maxOpenDesignRequests,
  maxRoomCount,
} from "@/lib/design-request-limit";
import {
  embeddedImageAccept,
  readEmbeddedImage,
} from "@/lib/client-image-upload";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { dateError, manilaDay, numberError, textError } from "@/lib/form-validation";
import { useHouseDesigns } from "@/lib/house-design-store";
import { finishLevelDescriptions, finishLevels, type FinishLevel } from "@/lib/house-design-data";
import Link from "next/link";
import type { DesignRequestDto, DesignRequestStatus } from "@/types/design-requests";
import {
  Hourglass,
  ImagePlus,
  Send,
  X,
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type SelectedImage = {
  src: string;
  name: string;
};

const maxImages = 6;

const statusClass: Record<DesignRequestStatus, string> = {
  Pending: "bg-amber-50 text-amber-800",
  "In review": "bg-sky-50 text-sky-700",
  Approved: "bg-violet-50 text-violet-700",
  "In customer review": "bg-rose-50 text-red-800",
  "Changes requested": "bg-amber-50 text-amber-800",
  "Design approved": "bg-emerald-50 text-emerald-700",
  Rejected: "bg-red-50 text-red-700",
  Completed: "bg-emerald-50 text-emerald-700",
};

const statusLabel: Record<DesignRequestStatus, string> = {
  Pending: "Waiting for feasibility review",
  "In review": "Under feasibility review",
  Approved: "Approved — design and floor plan in progress",
  "In customer review": "Ready for your review — open Dream House",
  "Changes requested": "Your requested changes are being made",
  "Design approved": "Design approved — continue to the cost estimate in Dream House",
  Rejected: "Not feasible",
  Completed: "Delivered — check Dream House for access",
};

function formatDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The Terms and Conditions were agreed to once for the account, so the form opens directly. */
export function CustomerDesignRequests({ houseDesignId }: { houseDesignId?: string }) {
  return <DesignRequestForm houseDesignId={houseDesignId} />;
}

function DesignRequestForm({ houseDesignId }: {
  houseDesignId?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { designs, catalog, isLoading: isCatalogLoading, error: catalogError } = useHouseDesigns();
  const hasDesignSelection = houseDesignId !== undefined;
  const selectedDesign = designs.find((design) => design.id === houseDesignId);
  const selectionUnavailable = hasDesignSelection && !isCatalogLoading && !selectedDesign;
  const [requests, setRequests] = useState<DesignRequestDto[]>([]);
  const [houseType, setHouseType] = useState<string | null>(null);
  const [finish, setFinish] = useState<FinishLevel | "">("");
  const [floorArea, setFloorArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [notes, setNotes] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [minDate] = useState(() => manilaDay(1));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [inspirationImages, setInspirationImages] = useState<SelectedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
    let active = true;
    fetch("/api/design-requests", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          requests?: DesignRequestDto[];
          error?: string;
        };
        if (!response.ok || !payload.requests) {
          throw new Error(payload.error ?? "Unable to load design requests.");
        }
        return payload.requests;
      })
      .then((items) => {
        if (active) setRequests(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load design requests.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleInspirationImages = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const remainingSlots = maxImages - inspirationImages.length;
    if (remainingSlots <= 0) {
      setImageError(`You can upload up to ${maxImages} inspiration images.`);
      return;
    }

    setIsReadingImage(true);
    setImageError(null);
    setError(null);
    setSuccessMessage(null);
    try {
      const selected = await Promise.all(
        files.slice(0, remainingSlots).map(async (file) => ({
          src: await readEmbeddedImage(file),
          name: file.name,
        })),
      );
      setInspirationImages((current) => [...current, ...selected]);
      if (files.length > remainingSlots) {
        setImageError(`Only ${remainingSlots} more image(s) were added. The limit is ${maxImages}.`);
      }
    } catch (readError) {
      setImageError(
        readError instanceof Error
          ? readError.message
          : "Unable to read the inspiration image.",
      );
    } finally {
      setIsReadingImage(false);
    }
  };

  const openRequestCount = countOpenDesignRequests(requests);
  const limitReached = !isLoading && openRequestCount >= maxOpenDesignRequests;

  const preferredDateError = dateError(preferredDate, {
    label: "Preferred Date",
    min: minDate,
    minLabel: `tomorrow (${formatDay(minDate)}); it must be after today`,
  });
  const neededByError =
    dateError(neededBy, {
      label: "Needed By",
      min: minDate,
      minLabel: `tomorrow (${formatDay(minDate)}); it must be after today`,
    }) ??
    (!preferredDateError && preferredDate && neededBy < preferredDate
      ? `Needed By must be on or after the Preferred Date (${formatDay(preferredDate)}).`
      : null);
  const fieldErrors: Record<string, string | null> = {
    houseType: hasDesignSelection || houseType ? null : "Choose the house type for your design.",
    finish: hasDesignSelection || finish ? null : "Choose the finish level you expect.",
    floorArea: hasDesignSelection ? null : numberError(floorArea, { label: "Floor area", max: 100_000, unit: " sq m" }) ??
      (Number(floorArea) <= 0 ? "Floor area must be more than 0 sq m." : null),
    bedrooms: hasDesignSelection ? null : numberError(bedrooms, { label: "Number of bedrooms", integer: true, min: 0, max: maxRoomCount }),
    bathrooms: hasDesignSelection ? null : numberError(bathrooms, { label: "Number of bathrooms", integer: true, min: 0, max: maxRoomCount }),
    notes: textError(notes, {
      label: "Description",
      required: !hasDesignSelection,
      max: 4000,
    }),
    preferredDate: preferredDateError,
    neededBy: neededByError,
    images: !hasDesignSelection && inspirationImages.length === 0
      ? "Upload at least one inspiration image (JPG, PNG, or WebP, up to 750 KB each)."
      : null,
  };
  const fieldIds: Record<string, string> = {
    houseType: "dr-house-type", finish: "dr-finish", floorArea: "dr-floor-area", bedrooms: "dr-bedrooms", bathrooms: "dr-bathrooms",
    notes: "dr-notes", preferredDate: "dr-preferred-date", neededBy: "dr-needed-by", images: "dr-images",
  };
  const fieldOrder = ["houseType", "finish", "floorArea", "bedrooms", "bathrooms", "notes", "preferredDate", "neededBy", "images"];
  const touch = (name: string) => setTouched((current) => (current[name] ? current : { ...current, [name]: true }));
  /** The message for a field, shown after it was left or a submit was attempted. */
  const showError = (name: string) => {
    if (name === "images" && imageError) return imageError;
    return (submitted || touched[name] ? fieldErrors[name] : null) ?? null;
  };
  const describe = (name: string) => {
    const message = showError(name);
    return {
      "aria-invalid": message ? true : undefined,
      "aria-describedby": message ? `${fieldIds[name]}-error` : undefined,
    } as const;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (limitReached) {
      setError(designRequestLimitMessage);
      return;
    }
    if (hasDesignSelection && !selectedDesign) {
      setError("Choose an available design from Finished Designs before submitting your request.");
      return;
    }

    setSubmitted(true);
    const firstInvalid = fieldOrder.find((name) => fieldErrors[name]);
    if (firstInvalid) {
      const element = document.getElementById(fieldIds[firstInvalid]);
      element?.focus();
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/design-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(selectedDesign ? { houseDesignId: selectedDesign.id } : {
            houseType,
            finish,
            floorArea: Number(floorArea),
            bedrooms: Number(bedrooms),
            bathrooms: Number(bathrooms),
          }),
          notes,
          preferredDate,
          neededBy,
          inspirationImages: inspirationImages.map((image) => image.src),
        }),
      });
      const payload = (await response.json()) as {
        request?: DesignRequestDto;
        error?: string;
        issues?: { message?: string }[];
      };
      if (!response.ok || !payload.request) {
        throw new Error(
          payload.issues?.[0]?.message ??
            payload.error ??
            "Unable to submit the design request.",
        );
      }

      setRequests((current) => [payload.request as DesignRequestDto, ...current]);
      setHouseType(null);
      setFinish("");
      setFloorArea("");
      setBedrooms("");
      setBathrooms("");
      setNotes("");
      setPreferredDate("");
      setNeededBy("");
      setInspirationImages([]);
      setTouched({});
      setSubmitted(false);
      setImageError(null);
      setSuccessMessage(
        selectedDesign
          ? `Your request for ${selectedDesign.name} was sent to the admin for review. Track it in Dream House, where you will review the design and floor plan for free.`
          : "Your request and inspiration images were sent directly to the admin for feasibility review.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit the design request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            Step 1 of the design workflow
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-semibold tracking-tight outline-none">
            {hasDesignSelection ? "Request This Design" : "New Design Request"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            {hasDesignSelection
              ? "Request the selected house design as shown, or suggest the materials, items, and changes you prefer. The admin will review your request, then share the design and floor plan for your review."
              : "Share your requirements and reference images. The admin will first review whether the request is feasible before design work begins."}
          </p>
        </div>

        {limitReached || error === designRequestLimitMessage ? (
          <div role="status" className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
            <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <p className="font-semibold text-red-900">Request Limit Reached</p>
              <p className="mt-1 leading-6 text-stone-700">{designRequestLimitMessage}</p>
            </div>
          </div>
        ) : null}
        {error && error !== designRequestLimitMessage ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {successMessage ? (
          <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        <form onSubmit={submit} noValidate>
          {hasDesignSelection ? (
            <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
              {isCatalogLoading ? <p role="status" className="text-sm text-stone-600">Loading your selected design…</p> : null}
              {selectionUnavailable ? (
                <div role="alert">
                  <p className="text-sm text-red-700">{catalogError ?? "This design is no longer available. Please choose another published design."}</p>
                  <Link href="/customer/finished-designs" className="mt-2 inline-block text-sm font-semibold text-red-700 underline">Choose Another Design</Link>
                </div>
              ) : selectedDesign ? (
                <div className="flex flex-col gap-4 sm:flex-row">
                  {selectedDesign.images[0] ? <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-lg sm:w-40"><Image src={selectedDesign.images[0]} alt={selectedDesign.name} fill unoptimized className="object-cover" /></div> : null}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Selected Design</p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight">{selectedDesign.name}</h2>
                    <p className="mt-1 text-sm text-stone-600">{selectedDesign.houseType ? `${selectedDesign.houseType} · ` : ""}{selectedDesign.area} sqm</p>
                    <p className="mt-1 text-sm text-stone-600">{selectedDesign.rooms}</p>
                    <p className="mt-2 text-xs text-stone-500">These specifications will be included with your request. The design review is free; only the blueprint is billed.</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
          <>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={fieldIds.houseType} className="block text-sm font-semibold">
              House Type <RequiredIndicator />
            </label>
            <p id={`${fieldIds.houseType}-hint`} className="mt-1 text-sm text-stone-600">
              Choose the style for your design. When the house is built, it is filed under this category in our house designs.
            </p>
            <select
              id={fieldIds.houseType}
              value={houseType ?? ""}
              disabled={!catalog.houseTypes.length}
              onChange={(event) => {
                setHouseType(event.target.value || null);
                touch("houseType");
              }}
              onBlur={() => touch("houseType")}
              aria-invalid={showError("houseType") ? true : undefined}
              aria-describedby={[`${fieldIds.houseType}-hint`, showError("houseType") ? `${fieldIds.houseType}-error` : ""].filter(Boolean).join(" ")}
              className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 aria-invalid:border-red-600"
            >
              <option value="">{catalog.houseTypes.length ? "Select a house type" : "Loading house types…"}</option>
              {catalog.houseTypes.map((type) => (
                <option key={type.heading} value={type.heading}>{type.heading}</option>
              ))}
            </select>
            {houseType ? (
              <p className="mt-2 text-xs leading-5 text-stone-500">
                {catalog.houseTypes.find((type) => type.heading === houseType)?.description}
              </p>
            ) : null}
            <FieldError id={`${fieldIds.houseType}-error`} message={showError("houseType")} />
          </div>
          <div className="min-w-0">
            <label htmlFor={fieldIds.finish} className="block text-sm font-semibold">
              Finish Level <RequiredIndicator />
            </label>
            <p id={`${fieldIds.finish}-hint`} className="mt-1 text-sm text-stone-600">
              The quality of materials and fixtures you expect. It guides the design and your construction cost estimate.
            </p>
            <select
              id={fieldIds.finish}
              value={finish}
              onChange={(event) => {
                setFinish(event.target.value as FinishLevel | "");
                touch("finish");
              }}
              onBlur={() => touch("finish")}
              aria-invalid={showError("finish") ? true : undefined}
              aria-describedby={[`${fieldIds.finish}-hint`, showError("finish") ? `${fieldIds.finish}-error` : ""].filter(Boolean).join(" ")}
              className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 aria-invalid:border-red-600"
            >
              <option value="">Select a finish level</option>
              {finishLevels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
            {finish ? <p className="mt-2 text-xs leading-5 text-stone-500">{finishLevelDescriptions[finish]}</p> : null}
            <FieldError id={`${fieldIds.finish}-error`} message={showError("finish")} />
          </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block">
                <span className="block text-sm font-semibold">
                  Floor Area (m²)
                </span>
                <input
                  id={fieldIds.floorArea}
                  type="number"
                  min="1"
                  max="100000"
                  step="0.01"
                  value={floorArea}
                  onChange={(event) => setFloorArea(event.target.value)}
                  onBlur={() => touch("floorArea")}
                  required
                  placeholder="Enter floor area"
                  {...describe("floorArea")}
                  className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600 aria-invalid:border-red-600"
                />
              </label>
              <FieldError id={`${fieldIds.floorArea}-error`} message={showError("floorArea")} />
            </div>
            <div>
              <label className="block">
                <span className="block text-sm font-semibold">
                  Number of Bedrooms
                </span>
                <input
                  id={fieldIds.bedrooms}
                  type="number"
                  min="0"
                  max={maxRoomCount}
                  step="1"
                  value={bedrooms}
                  onChange={(event) => setBedrooms(event.target.value)}
                  onBlur={() => touch("bedrooms")}
                  required
                  placeholder={`0 to ${maxRoomCount} bedrooms`}
                  {...describe("bedrooms")}
                  className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600 aria-invalid:border-red-600"
                />
              </label>
              <FieldError id={`${fieldIds.bedrooms}-error`} message={showError("bedrooms")} />
            </div>
            <div>
              <label className="block">
                <span className="block text-sm font-semibold">
                  Number of Bathrooms
                </span>
                <input
                  id={fieldIds.bathrooms}
                  type="number"
                  min="0"
                  max={maxRoomCount}
                  step="1"
                  value={bathrooms}
                  onChange={(event) => setBathrooms(event.target.value)}
                  onBlur={() => touch("bathrooms")}
                  required
                  placeholder={`0 to ${maxRoomCount} bathrooms`}
                  {...describe("bathrooms")}
                  className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600 aria-invalid:border-red-600"
                />
              </label>
              <FieldError id={`${fieldIds.bathrooms}-error`} message={showError("bathrooms")} />
            </div>
          </div>
          </>
          )}

          <div className="mt-5">
            <label className="block text-sm font-semibold">
              {hasDesignSelection ? "Preferred materials, items, or changes (optional)" : "Description"}
              <textarea
                id={fieldIds.notes}
                rows={5}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={() => touch("notes")}
                required={!hasDesignSelection}
                maxLength={4000}
                placeholder={hasDesignSelection ? "Leave blank to request the design as shown, or suggest what you want, such as stone-coated steel roofing, uPVC windows, a solid wood entry door, or a perimeter fence." : "Describe the style, layout, preferred materials, colors, and budget concerns."}
                {...describe("notes")}
                className="mt-2 w-full resize-none rounded-lg border border-stone-200 px-3 py-3 text-sm font-normal outline-none placeholder:text-stone-400 focus:border-red-600 aria-invalid:border-red-600"
              />
            </label>
            <FieldError id={`${fieldIds.notes}-error`} message={showError("notes")} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block">
                <span className="block text-sm font-semibold">
                  Preferred Date <RequiredIndicator />
                </span>
                <input
                  id={fieldIds.preferredDate}
                  type="date"
                  min={minDate}
                  value={preferredDate}
                  onChange={(event) => setPreferredDate(event.target.value)}
                  onBlur={() => touch("preferredDate")}
                  required
                  {...describe("preferredDate")}
                  className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600 aria-invalid:border-red-600"
                />
                <span className="mt-1 block text-xs font-normal text-stone-500">When you would like the design ready.</span>
              </label>
              <FieldError id={`${fieldIds.preferredDate}-error`} message={showError("preferredDate")} />
            </div>
            <div>
              <label className="block">
                <span className="block text-sm font-semibold">
                  Needed By <RequiredIndicator />
                </span>
                <input
                  id={fieldIds.neededBy}
                  type="date"
                  min={preferredDate > minDate ? preferredDate : minDate}
                  value={neededBy}
                  onChange={(event) => setNeededBy(event.target.value)}
                  onBlur={() => touch("neededBy")}
                  required
                  {...describe("neededBy")}
                  className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600 aria-invalid:border-red-600"
                />
                <span className="mt-1 block text-xs font-normal text-stone-500">The latest date you need it.</span>
              </label>
              <FieldError id={`${fieldIds.neededBy}-error`} message={showError("neededBy")} />
            </div>
          </div>

          <div className="mt-5 outline-none" id={fieldIds.images} tabIndex={-1}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{hasDesignSelection ? "Additional Reference Images (optional)" : "House Inspiration Images"}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {hasDesignSelection ? "Up to 6 optional images; your selected design is already included." : "1–6 images"} · JPG, PNG, or WebP · maximum 750 KB each
                </p>
              </div>
              {inspirationImages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setInspirationImages([])}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900"
                >
                  <X className="h-4 w-4" /> Clear All
                </button>
              ) : null}
            </div>

            {inspirationImages.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {inspirationImages.map((image, index) => (
                  <div key={`${image.name}-${index}`} className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
                    <div className="relative aspect-[4/3]">
                      <Image
                        src={image.src}
                        alt={`House inspiration ${index + 1}`}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setInspirationImages((current) =>
                            current.filter((_, position) => position !== index),
                          )
                        }
                        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-stone-950/75 text-white hover:bg-red-700"
                        aria-label={`Remove inspiration image ${index + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="truncate px-3 py-2 text-xs text-stone-500">{image.name}</p>
                  </div>
                ))}
                {inspirationImages.length < maxImages ? (
                  <label className="grid min-h-36 cursor-pointer place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-center hover:border-red-300 hover:bg-red-50/40">
                    <span>
                      <ImagePlus className="mx-auto h-7 w-7 text-red-700" />
                      <span className="mt-2 block text-xs font-semibold">Add More Images</span>
                    </span>
                    <input
                      type="file"
                      multiple
                      accept={embeddedImageAccept}
                      onChange={(event) => void handleInspirationImages(event)}
                      className="sr-only"
                    />
                  </label>
                ) : null}
              </div>
            ) : (
              <label className="mt-3 grid min-h-44 cursor-pointer place-items-center rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center transition hover:border-red-300 hover:bg-red-50/40">
                <span>
                  <ImagePlus className="mx-auto h-9 w-9 text-red-700" />
                  <span className="mt-3 block text-sm font-semibold">
                    {isReadingImage ? "Reading images…" : hasDesignSelection ? "Add Reference Images (optional)" : "Upload Inspiration Images"}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    {hasDesignSelection ? "Add images only if you want to explain a change." : "Choose a photo that represents the house you want."}
                  </span>
                </span>
                <input
                  type="file"
                  multiple
                  accept={embeddedImageAccept}
                  onChange={(event) => void handleInspirationImages(event)}
                  className="sr-only"
                />
              </label>
            )}
          </div>

          <FieldError id={`${fieldIds.images}-error`} message={showError("images")} />

          <button
            type="submit"
            disabled={limitReached || isSubmitting || isReadingImage || (hasDesignSelection && (isCatalogLoading || !selectedDesign))}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? "Sending to admin…" : hasDesignSelection ? "Submit Design Request" : "Submit for Feasibility Review"}
          </button>
          {!isLoading ? (
            <p className="mt-2 text-xs text-stone-500">
              {openRequestCount} of {maxOpenDesignRequests} requests waiting for review. You can have up to {maxOpenDesignRequests} at a time.
            </p>
          ) : null}
        </form>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Request History</h2>
        <p className="mt-1 text-sm text-stone-600">
          Track approval and design work. Delivered designs are kept in Dream House and unlock after full payment is verified.
        </p>
        <div className="mt-4 space-y-4">
          {requests.map((request) => (
            <article key={request.id} className="overflow-hidden rounded-xl border border-stone-200">
              {request.inspirationImages.length > 0 ? (
                <div className="relative aspect-[16/7] border-b border-stone-200 bg-stone-100">
                  <Image
                    src={request.inspirationImages[0]}
                    alt="Submitted house inspiration"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <span className="absolute bottom-2 left-2 rounded bg-stone-950/70 px-2 py-1 text-[11px] font-semibold text-white">
                    {request.inspirationImages.length} inspiration image{request.inspirationImages.length === 1 ? "" : "s"}
                  </span>
                </div>
              ) : null}

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {request.selectedDesign ? <p className="mb-1 text-sm font-semibold text-red-800">{request.selectedDesign.name}</p> : null}
                    <p className="text-sm font-semibold">
                      {request.floorArea} sqm{request.houseType ? ` · ${request.houseType}` : ""}{request.finish ? ` · ${request.finish} finish` : ""} · {request.rooms}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Submitted {formatDate(request.createdAt)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass[request.status]}`}>
                    {request.status}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold text-stone-700">
                  {statusLabel[request.status]}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-stone-50 px-3 py-2">
                    <dt className="text-xs text-stone-500">Preferred Date</dt>
                    <dd className="mt-1 font-semibold text-stone-950">{request.preferredDate ? formatDay(request.preferredDate) : "Not specified"}</dd>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2">
                    <dt className="text-xs text-stone-500">Needed By</dt>
                    <dd className="mt-1 font-semibold text-stone-950">{request.neededBy ? formatDay(request.neededBy) : "Not specified"}</dd>
                  </div>
                </dl>
                {request.bedrooms !== undefined && request.bathrooms !== undefined ? (
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-stone-50 px-3 py-2">
                      <dt className="text-xs text-stone-500">Bedrooms</dt>
                      <dd className="mt-1 font-semibold text-stone-950">{request.bedrooms}</dd>
                    </div>
                    <div className="rounded-lg bg-stone-50 px-3 py-2">
                      <dt className="text-xs text-stone-500">Bathrooms</dt>
                      <dd className="mt-1 font-semibold text-stone-950">{request.bathrooms}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-stone-600">{request.rooms}</p>
                )}
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-stone-500">
                  {request.notes}
                </p>
                {request.completedAt ? (
                  <p className="mt-3 text-xs font-semibold text-emerald-700">
                    Delivered {formatDate(request.completedAt)} · Open Dream House for payment and viewing
                  </p>
                ) : null}
              </div>
            </article>
          ))}
          {isLoading ? (
            <p className="py-6 text-center text-sm text-stone-500">Loading requests…</p>
          ) : null}
          {!isLoading && requests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-200 p-6 text-center text-sm text-stone-500">
              No design requests yet.
            </p>
          ) : null}
        </div>
      </section>
      </div>

      <Link href="/customer/dream-house" className="inline-flex rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800">Open Dream House</Link>
    </div>
  );
}
