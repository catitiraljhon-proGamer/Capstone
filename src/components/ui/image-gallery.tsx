"use client";

import { ImageSlider } from "@/components/ui/image-slider";
import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

const projectImages = [
  {
    src: "/House/image.png",
    title: "Modern Residential Design",
    cost: "PHP 6,000,000",
    area: "150 sqm",
    rate: "PHP 40,000 / sqm",
    finish: "Standard finish",
    rooms: "3 bedrooms, 2 toilets",
    status: "Design presentation",
  },
  {
    src: "/House/Screenshot%202026-07-29%20003940.png",
    title: "Two-Storey Facade Study",
    cost: "PHP 8,640,000",
    area: "180 sqm",
    rate: "PHP 48,000 / sqm",
    finish: "Semi-luxury finish",
    rooms: "4 bedrooms, 3 toilets",
    status: "For admin review",
  },
  {
    src: "/House/Screenshot%202026-07-29%20003957.png",
    title: "Residential Perspective",
    cost: "PHP 4,200,000",
    area: "120 sqm",
    rate: "PHP 35,000 / sqm",
    finish: "Standard finish",
    rooms: "2 bedrooms, 2 toilets",
    status: "Cost planning",
  },
  {
    src: "/House/Screenshot%202026-07-29%20011237.png",
    title: "Exterior Design Preview",
    cost: "PHP 7,200,000",
    area: "160 sqm",
    rate: "PHP 45,000 / sqm",
    finish: "Semi-luxury finish",
    rooms: "3 bedrooms, 3 toilets",
    status: "Client preview",
  },
  {
    src: "/House/image.png",
    title: "Cost Planning Reference",
    cost: "PHP 6,000,000",
    area: "150 sqm",
    rate: "PHP 40,000 / sqm",
    finish: "Standard finish",
    rooms: "3 bedrooms, 2 toilets",
    status: "Estimate reference",
  },
  {
    src: "/House/Screenshot%202026-07-29%20003940.png",
    title: "Project Presentation View",
    cost: "PHP 8,640,000",
    area: "180 sqm",
    rate: "PHP 48,000 / sqm",
    finish: "Semi-luxury finish",
    rooms: "4 bedrooms, 3 toilets",
    status: "Presentation ready",
  },
];

export default function ImageGallery() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedProject =
    selectedIndex === null ? null : projectImages[selectedIndex];
  const sliderImages = projectImages.map((image) => image.src);

  return (
    <section className="flex w-full flex-col items-center justify-start py-8">
      <div className="max-w-3xl px-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
          Our Latest Projects
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          A visual collection of project design previews for admin monitoring,
          approvals, and client presentation reference.
        </p>
      </div>

      <div className="mt-10 w-full max-w-5xl overflow-x-auto px-4 pb-2">
        <div className="flex h-[400px] min-w-max items-center gap-2">
          {projectImages.map((image, index) => (
            <button
              key={`${image.src}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onBlur={() => setActiveIndex(null)}
              className={[
                "group relative h-[400px] w-56 shrink-0 overflow-hidden rounded-lg border border-stone-200 transition-all duration-500",
                activeIndex === index ? "w-[520px]" : "",
              ].join(" ")}
              aria-label={`Open ${image.title}`}
            >
              <Image
                src={image.src}
                alt={image.title}
                fill
                className="object-cover object-center"
                sizes="(min-width: 1024px) 16vw, 56vw"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950/80 to-transparent p-4 text-left">
                <span className="block text-sm font-semibold text-white">
                  {image.title}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedProject ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-stone-950/70 p-4 backdrop-blur-sm">
          <button
            type="button"
            className="fixed inset-0 cursor-default"
            aria-label="Close project preview"
            onClick={() => setSelectedIndex(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative mx-auto grid min-h-[620px] w-full max-w-6xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl lg:grid-cols-[0.82fr_1.18fr]"
          >
            <div className="flex h-full flex-col justify-center p-6 md:p-10">
              <p className="text-sm font-semibold text-red-700">
                {selectedProject.status}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                {selectedProject.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Project estimate overview based on floor area, finish level,
                and planning assumptions. Final costing may still change after
                detailed BOQ review and approval.
              </p>

              <dl className="mt-8 grid gap-4">
                {[
                  ["Total Cost", selectedProject.cost],
                  ["Floor Area", selectedProject.area],
                  ["Cost Per Sqm", selectedProject.rate],
                  ["Finish Level", selectedProject.finish],
                  ["Room Setup", selectedProject.rooms],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-stone-200 p-4"
                  >
                    <dt className="text-xs font-semibold uppercase text-stone-500">
                      {label}
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-stone-950">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <button
                type="button"
                onClick={() => setSelectedIndex(null)}
                className="mt-8 rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800"
              >
                Back to Projects
              </button>
            </div>

            <div className="min-h-[360px] lg:min-h-full">
              <ImageSlider
                images={sliderImages}
                initialIndex={selectedIndex ?? 0}
                interval={4000}
              />
            </div>
          </motion.div>
        </div>
      ) : null}
    </section>
  );
}
