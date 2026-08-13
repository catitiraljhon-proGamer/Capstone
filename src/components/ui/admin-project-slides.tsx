"use client";

import { BackButton } from "@/components/ui/back-button";
import ColorChangeCards from "@/components/ui/color-change-card";
import ImageGallery from "@/components/ui/image-gallery";
import { NextButton } from "@/components/ui/next-button";
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
            <NextButton
              type="button"
              onClick={() => setActiveSlide("houseTypes")}
            />
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
            <BackButton
              type="button"
              onClick={() => setActiveSlide("projects")}
            />
          </div>
          <ColorChangeCards />
        </div>
      )}
    </section>
  );
}
