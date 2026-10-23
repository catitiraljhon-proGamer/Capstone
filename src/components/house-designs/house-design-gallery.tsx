"use client";

import { DesignWatermark } from "@/components/ui/design-watermark";
import { isDataImage } from "@/lib/house-design-data";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

/**
 * Main image with a thumbnail strip, matching the showcase pattern on the
 * landing page. Falls back to a placeholder when a design has no images.
 */
/** Data URLs and same-origin API images bypass the optimizer, which cannot forward the session cookie. */
const skipOptimizer = (src: string) => isDataImage(src) || src.startsWith("/api/");

export function HouseDesignGallery({
  images,
  name,
  protectedView = false,
  fit = "cover",
  navigation,
}: {
  images: string[];
  name: string;
  /** Customer-facing view: watermark the image and block right-click/drag saving. */
  protectedView?: boolean;
  /** "contain" keeps floor plans and drawings uncropped. */
  fit?: "cover" | "contain";
  /** Clicking the left or right side of the photo opens the previous or next design. */
  navigation?: {
    position: string | null;
    onPrevious?: () => void;
    onNext?: () => void;
    previousName?: string;
    nextName?: string;
  };
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = activeIndex < images.length ? activeIndex : 0;
  const activeImage = images[safeIndex];

  if (!activeImage) {
    return (
      <div className="grid h-[320px] place-items-center rounded-xl border border-dashed border-stone-200 bg-stone-50 text-center sm:h-[460px]">
        <div>
          <ImageOff
            className="mx-auto h-8 w-8 text-stone-400"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-semibold text-stone-950">
            No images uploaded yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div
          className="relative h-[320px] bg-stone-100 sm:h-[460px] xl:h-[560px]"
          onContextMenu={protectedView ? (event) => event.preventDefault() : undefined}
        >
          {protectedView ? <DesignWatermark /> : null}
          {/* Photos are shown whole, never cropped; a blurred copy fills the space beside them. */}
          {fit === "cover" ? (
            <Image
              key={`${activeImage}-backdrop`}
              src={activeImage}
              alt=""
              aria-hidden="true"
              fill
              unoptimized={skipOptimizer(activeImage)}
              draggable={false}
              className="scale-110 object-cover opacity-60 blur-2xl"
              sizes="(min-width: 1024px) 72vw, 100vw"
            />
          ) : null}
          <Image
            key={activeImage}
            src={activeImage}
            alt={`${name} exterior view ${safeIndex + 1} of ${images.length}`}
            fill
            priority
            unoptimized={skipOptimizer(activeImage)}
            draggable={!protectedView}
            className="object-contain"
            sizes="(min-width: 1024px) 72vw, 100vw"
          />
          {navigation?.onPrevious && navigation.onNext ? (
            <>
              <button
                type="button"
                onClick={navigation.onPrevious}
                aria-label={`Previous design: ${navigation.previousName}`}
                className="group absolute inset-y-0 left-0 z-20 flex w-1/2 cursor-w-resize items-center justify-start pl-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600"
              >
                <ChevronLeft className="h-10 w-10 rounded-full bg-white/70 p-2 text-stone-800 opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={navigation.onNext}
                aria-label={`Next design: ${navigation.nextName}`}
                className="group absolute inset-y-0 right-0 z-20 flex w-1/2 cursor-e-resize items-center justify-end pr-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600"
              >
                <ChevronRight className="h-10 w-10 rounded-full bg-white/70 p-2 text-stone-800 opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              </button>
              {navigation.position ? (
                <span className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-md bg-stone-950/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                  {navigation.position}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {images.length > 1 ? (
        <div
          className="grid grid-cols-4 gap-2 sm:grid-cols-6"
          role="group"
          aria-label={`${name} image thumbnails`}
          onContextMenu={protectedView ? (event) => event.preventDefault() : undefined}
        >
          {images.map((imageSrc, index) => (
            <button
              key={`${imageSrc.slice(0, 40)}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-current={index === safeIndex}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              className={[
                "relative aspect-[1.42/1] overflow-hidden rounded-lg border bg-stone-100 transition focus:outline-none focus:ring-2 focus:ring-red-600",
                index === safeIndex
                  ? "border-red-700 ring-2 ring-red-700/20"
                  : "border-stone-200 hover:border-stone-300",
              ].join(" ")}
            >
              <Image
                src={imageSrc}
                alt=""
                fill
                unoptimized={skipOptimizer(imageSrc)}
                draggable={!protectedView}
                className={fit === "contain" ? "object-contain" : "object-cover"}
                sizes="160px"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
