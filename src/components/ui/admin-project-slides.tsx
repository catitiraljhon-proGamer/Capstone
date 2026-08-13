"use client";

import ColorChangeCards from "@/components/ui/color-change-card";
import ImageGallery from "@/components/ui/image-gallery";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";

export function AdminProjectSlides() {
  const [activeSlide, setActiveSlide] = useState<"projects" | "houseTypes">(
    "projects",
  );

  return (
    <section className="space-y-6">
      {activeSlide === "projects" ? (
        <>
          <ImageGallery />
          <div className="flex justify-end border-t border-stone-200 pt-5">
            <button
              type="button"
              onClick={() => setActiveSlide("houseTypes")}
              className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-stone-950">
                Choose House Type
              </h1>
              <p className="mt-1 text-sm text-stone-600">
                Select one of six house styles for admin project planning and
                estimate setup.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSlide("projects")}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
          <ColorChangeCards />
        </div>
      )}
    </section>
  );
}
