"use client";

import type { HouseDesignFinish } from "@/components/ui/house-design-data";
import {
  embeddedImageAccept,
  readEmbeddedImage,
} from "@/lib/client-image-upload";
import { useHouseDesigns } from "@/lib/house-design-store";
import {
  CheckCircle2,
  Download,
  ImagePlus,
  Layers3,
  PencilRuler,
  Ruler,
  Send,
  X,
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type DesignRequestStatus =
  | "Pending"
  | "In review"
  | "Approved"
  | "Rejected"
  | "Completed";

type DesignRequestDto = {
  id: string;
  floorArea: number;
  rooms: string;
  finish: HouseDesignFinish;
  notes: string;
  inspirationImages: string[];
  completedDesignImages: string[];
  status: DesignRequestStatus;
  completedAt?: string;
  createdAt: string;
};

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
  Completed: "Design ready",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CustomerDesignRequests() {
  const { catalog } = useHouseDesigns();
  const [requests, setRequests] = useState<DesignRequestDto[]>([]);
  const [floorArea, setFloorArea] = useState("");
  const [rooms, setRooms] = useState("");
  const [finish, setFinish] = useState<HouseDesignFinish>("Standard");
  const [notes, setNotes] = useState("");
  const [inspirationImages, setInspirationImages] = useState<SelectedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
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
          rooms,
          finish,
          notes,
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
      setFloorArea("");
      setRooms("");
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

  const approvedDesigns = requests.filter(
    (request) => request.completedDesignImages.length > 0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            Step 1 of the design workflow
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            New Design Request
          </h1>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Share your requirements and reference images. The admin will first
            review whether the request is feasible before design work begins.
          </p>
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
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Ruler className="h-4 w-4 text-red-700" /> Floor Area
              </span>
              <input
                type="number"
                min="1"
                value={floorArea}
                onChange={(event) => setFloorArea(event.target.value)}
                required
                placeholder="150"
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600"
              />
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <PencilRuler className="h-4 w-4 text-red-700" /> Rooms
              </span>
              <input
                value={rooms}
                onChange={(event) => setRooms(event.target.value)}
                required
                placeholder="3 bedrooms, 2 toilets"
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600"
              />
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Layers3 className="h-4 w-4 text-red-700" /> Finish Level
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
            Design requirements
            <textarea
              rows={5}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              required
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
          Track feasibility review and design-work status. Finished designs appear in the separate gallery below.
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
                <p className="mt-2 text-sm text-stone-600">{request.rooms}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-stone-500">
                  {request.notes}
                </p>
                {request.completedAt ? (
                  <p className="mt-3 text-xs font-semibold text-emerald-700">
                    Delivered {formatDate(request.completedAt)} · View in Approved Designs
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

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Completed work
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Approved Designs</h2>
            <p className="mt-1 text-sm text-stone-600">
              Final house-design images delivered by the admin are kept separately from request history.
            </p>
          </div>
          <span className="text-sm font-semibold text-stone-500">
            {approvedDesigns.length} completed request{approvedDesigns.length === 1 ? "" : "s"}
          </span>
        </div>

        {approvedDesigns.length > 0 ? (
          <div className="mt-5 space-y-6">
            {approvedDesigns.map((request) => (
              <article key={request.id} className="overflow-hidden rounded-xl border border-emerald-200">
                <div className="flex flex-col gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    {request.floorArea} sqm · {request.finish} design
                  </div>
                  <p className="text-xs text-emerald-700">
                    Delivered {request.completedAt ? formatDate(request.completedAt) : "by admin"}
                  </p>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {request.completedDesignImages.map((image, index) => (
                    <div key={`${request.id}-${index}`} className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={image}
                          alt={`Approved house design ${index + 1}`}
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                      <div className="border-t border-stone-200 p-3">
                        <a
                          href={image}
                          download={`approved-house-design-${request.id}-${index + 1}`}
                          className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                        >
                          <Download className="h-4 w-4" /> Download image {index + 1}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-stone-200 p-8 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-stone-300" />
            <p className="mt-3 text-sm font-semibold">No approved designs delivered yet</p>
            <p className="mt-1 text-xs text-stone-500">
              Completed images will appear here after an approved request is designed and sent by the admin.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
