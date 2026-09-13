"use client";

import { isDataImage } from "@/components/ui/house-design-data";
import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

/**
 * Main image with a thumbnail strip, matching the showcase pattern on the
 * landing page. Falls back to a placeholder when a design has no images.
 */
export function HouseDesignGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
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
        <div className="relative h-[320px] bg-stone-100 sm:h-[460px] xl:h-[560px]">
          <Image
            key={activeImage}
            src={activeImage}
            alt={`${name} exterior view ${safeIndex + 1} of ${images.length}`}
            fill
            priority
            unoptimized={isDataImage(activeImage)}
            className="object-cover"
            sizes="(min-width: 1024px) 72vw, 100vw"
          />
        </div>
      </div>

      {images.length > 1 ? (
        <div
          className="grid grid-cols-4 gap-2 sm:grid-cols-6"
          role="group"
          aria-label={`${name} image thumbnails`}
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
                unoptimized={isDataImage(imageSrc)}
                className="object-cover"
                sizes="160px"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
