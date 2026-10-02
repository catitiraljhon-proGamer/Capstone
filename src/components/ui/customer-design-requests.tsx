"use client";

import type { HouseDesignFinish } from "@/components/ui/house-design-data";
import { DesignRequestTermsDialog } from "@/components/ui/design-request-terms-dialog";
import type { DesignTermsAcceptance } from "@/lib/design-request-terms";
import {
  embeddedImageAccept,
  readEmbeddedImage,
} from "@/lib/client-image-upload";
import { useHouseDesigns } from "@/lib/house-design-store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DesignRequestDto } from "@/types/design-requests";
import {
  ImagePlus,
  Send,
  X,
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type DesignRequestStatus =
  | "Pending"
  | "In review"
  | "Approved"
  | "Rejected"
  | "Completed";

type SelectedImage = {
  src: string;
  name: string;
};

const maxImages = 6;

const statusClass: Record<DesignRequestStatus, string> = {
  Pending: "bg-amber-50 text-amber-800",
  "In review": "bg-sky-50 text-sky-700",
  Approved: "bg-violet-50 text-violet-700",
  Rejected: "bg-red-50 text-red-700",
  Completed: "bg-emerald-50 text-emerald-700",
};

const statusLabel: Record<DesignRequestStatus, string> = {
  Pending: "Waiting for feasibility review",
  "In review": "Under feasibility review",
  Approved: "Approved — design in progress",
  Rejected: "Not feasible",
  Completed: "Delivered — check My House Design for access",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CustomerDesignRequests() {
  const router = useRouter();
  const [acceptance, setAcceptance] = useState<DesignTermsAcceptance | null>(null);
  const [isReviewingTerms, setIsReviewingTerms] = useState(false);

  return (
    <>
      {acceptance ? <DesignRequestForm acceptance={acceptance} onReviewTerms={() => setIsReviewingTerms(true)} /> : null}
      {!acceptance || isReviewingTerms ? (
        <DesignRequestTermsDialog
          onAccept={setAcceptance}
          onDecline={() => router.replace("/customer")}
          onClose={acceptance ? () => setIsReviewingTerms(false) : undefined}
        />
      ) : null}
    </>
  );
}

function DesignRequestForm({ acceptance, onReviewTerms }: { acceptance: DesignTermsAcceptance; onReviewTerms: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { catalog } = useHouseDesigns();
  const [requests, setRequests] = useState<DesignRequestDto[]>([]);
  const [floorArea, setFloorArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [finish, setFinish] = useState<HouseDesignFinish>("Standard");
  const [notes, setNotes] = useState("");
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
      setError(`You can upload up to ${maxImages} inspiration images.`);
      return;
    }

    setIsReadingImage(true);
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
        setError(`Only ${remainingSlots} more image(s) were added. The limit is ${maxImages}.`);
      }
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Unable to read the inspiration image.",
      );
    } finally {
      setIsReadingImage(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inspirationImages.length === 0) {
      setError("Upload at least one inspiration image before submitting your request.");
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
          floorArea: Number(floorArea),
          bedrooms: Number(bedrooms),
          bathrooms: Number(bathrooms),
          finish,
          notes,
          inspirationImages: inspirationImages.map((image) => image.src),
          termsAcceptanceId: acceptance.id,
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
      setFloorArea("");
      setBedrooms("");
      setBathrooms("");
      setNotes("");
      setInspirationImages([]);
      setSuccessMessage(
        "Your request and inspiration images were sent directly to the admin for feasibility review.",
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
            New Design Request
          </h1>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Share your requirements and reference images. The admin will first
            review whether the request is feasible before design work begins.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
          <p className="font-semibold text-red-900">Terms accepted · Full payment required before viewing</p>
          <p className="mt-1 leading-6 text-stone-600">Your delivered design unlocks after the Billing Clerk verifies the full design fee.</p>
          <button type="button" onClick={onReviewTerms} aria-haspopup="dialog" className="mt-2 rounded text-sm font-semibold text-red-700 underline underline-offset-4 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-red-600">
            Review Terms and Conditions
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {successMessage ? (
          <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        <form onSubmit={submit}>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-semibold">
                Floor Area (m²)
              </span>
              <input
                type="number"
                min="1"
                max="100000"
                step="0.01"
                value={floorArea}
                onChange={(event) => setFloorArea(event.target.value)}
                required
                placeholder="Enter floor area"
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold">
                Number of Bedrooms
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={bedrooms}
                onChange={(event) => setBedrooms(event.target.value)}
                required
                placeholder="Enter number of bedrooms"
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold">
                Number of Bathrooms
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={bathrooms}
                onChange={(event) => setBathrooms(event.target.value)}
                required
                placeholder="Enter number of bathrooms"
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold">
                Finish Level
              </span>
              <select
                value={finish}
                onChange={(event) =>
                  setFinish(event.target.value as HouseDesignFinish)
                }
                className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-600"
              >
                {catalog.finishes.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-5 block text-sm font-semibold">
            Description
            <textarea
              rows={5}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              required
              maxLength={4000}
              placeholder="Describe the style, layout, preferred materials, colors, and budget concerns."
              className="mt-2 w-full resize-none rounded-lg border border-stone-200 px-3 py-3 text-sm font-normal outline-none placeholder:text-stone-400 focus:border-red-600"
            />
          </label>

          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">House inspiration images</p>
                <p className="mt-1 text-xs text-stone-500">
                  1–6 images · JPG, PNG, or WebP · maximum 750 KB each
                </p>
              </div>
              {inspirationImages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setInspirationImages([])}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900"
                >
                  <X className="h-4 w-4" /> Clear all
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
                      <span className="mt-2 block text-xs font-semibold">Add more images</span>
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
                    {isReadingImage ? "Reading images…" : "Upload inspiration images"}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    Choose a photo that represents the house you want.
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

          <button
            type="submit"
            disabled={isSubmitting || isReadingImage}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? "Sending to admin…" : "Submit for Feasibility Review"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Request History</h2>
        <p className="mt-1 text-sm text-stone-600">
          Track approval and design work. Delivered designs are kept in My House Design and unlock after full payment is verified.
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
                    <p className="text-sm font-semibold">
                      {request.floorArea} sqm · {request.finish}
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
                    Delivered {formatDate(request.completedAt)} · Open My House Design for payment and viewing
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

      <Link href="/customer/house-design" className="inline-flex rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800">Open My House Design</Link>
    </div>
  );
}
