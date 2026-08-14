"use client";

import { BackButton } from "@/components/ui/back-button";
import ColorChangeCards from "@/components/ui/color-change-card";
import {
  designOptions,
  exteriorItemChoices,
  formatPeso,
  getExteriorEstimate,
} from "@/components/ui/house-design-data";
import { ProjectExteriorEstimatePanel } from "@/components/ui/project-exterior-estimate-panel";
import Image from "next/image";
import { useState } from "react";

export function AdminHouseDesignManager() {
  const [activeStep, setActiveStep] = useState<"types" | "designs" | "details" | "edit">("types");
  const [selectedHouseType, setSelectedHouseType] = useState<string | null>(null);
  const [selectedDesignIndex, setSelectedDesignIndex] = useState<number | null>(null);
  const [materialSelections, setMaterialSelections] = useState(
    exteriorItemChoices.map(() => 0),
  );
  const filteredDesigns = selectedHouseType
    ? designOptions.filter((design) => design.houseType === selectedHouseType)
    : [];
  const selectedDesign =
    selectedDesignIndex === null ? null : designOptions[selectedDesignIndex];

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      {activeStep === "types" ? (
        <div>
          <div className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight text-stone-950">
              Select House Type
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Admin can choose a house type first, then manage the designs and
              exterior materials under that category.
            </p>
          </div>
          <ColorChangeCards
            onSelect={(houseType) => {
              setSelectedHouseType(houseType);
              setSelectedDesignIndex(null);
              setMaterialSelections(exteriorItemChoices.map(() => 0));
              setActiveStep("designs");
            }}
          />
        </div>
      ) : activeStep === "designs" ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-stone-950">
                {selectedHouseType} House Designs
              </h1>
              <p className="mt-1 text-sm text-stone-600">
                Select a design to review and edit its exterior material setup.
              </p>
            </div>
            <BackButton type="button" onClick={() => setActiveStep("types")} />
          </div>

          {filteredDesigns.length > 0 ? (
            <div className="mt-5 columns-1 gap-4 sm:columns-2 xl:columns-3">
              {filteredDesigns.map((design) => {
                const designIndex = designOptions.findIndex(
                  (option) => option.name === design.name,
                );

                return (
                  <button
                    key={design.name}
                    type="button"
                    onClick={() => {
                      setSelectedDesignIndex(designIndex);
                      setMaterialSelections(exteriorItemChoices.map(() => 0));
                      setActiveStep("details");
                    }}
                    className="mb-4 inline-block w-full break-inside-avoid overflow-hidden rounded-xl bg-white text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600"
                    aria-label={`Manage materials for ${design.name}`}
                  >
                    <div
                      className={[
                        "relative overflow-hidden rounded-xl",
                        designIndex % 3 === 0
                          ? "h-56"
                          : designIndex % 3 === 1
                            ? "h-72"
                            : "h-48",
                      ].join(" ")}
                    >
                      <Image
                        src={design.image}
                        alt={`${design.name} visual preview`}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 25vw, 100vw"
                      />
                    </div>
                    <div className="px-1 py-3">
                      <h2 className="text-sm font-semibold tracking-tight text-stone-950">
                        {design.name}
                      </h2>
                      <p className="mt-1 text-xs text-stone-500">
                        {design.style} - {design.area} sqm
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-stone-200 p-6 text-center">
              <p className="text-sm font-semibold text-stone-950">
                No designs available for this house type yet.
              </p>
            </div>
          )}
        </>
      ) : selectedDesign ? (
        <div>
          <div className="mb-5 flex justify-start">
            <BackButton type="button" onClick={() => setActiveStep("designs")} />
          </div>

          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <div className="relative h-[320px] bg-stone-100 sm:h-[460px] xl:h-[560px]">
              <Image
                src={selectedDesign.image}
                alt={`${selectedDesign.name} enlarged house design`}
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 72vw, 100vw"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
                {selectedDesign.name}
              </h1>
              <p className="mt-1 text-sm text-stone-600">{selectedDesign.notes}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 text-right shadow-sm">
              <p className="text-sm font-semibold text-stone-500">
                Estimated Project Cost
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-red-700">
                {formatPeso(
                  getExteriorEstimate(selectedDesign, materialSelections)
                    .revisedEstimate,
                )}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <ProjectExteriorEstimatePanel
              design={selectedDesign}
              selections={materialSelections}
              isEditing={activeStep === "edit"}
              editorRole="Admin"
              onSelectionChange={(itemIndex, optionIndex) =>
                setMaterialSelections((current) =>
                  current.map((value, index) =>
                    index === itemIndex ? optionIndex : value,
                  ),
                )
              }
            />
          </div>

          <div className="mt-6 flex justify-end border-t border-stone-200 pt-5">
            {activeStep === "details" ? (
              <button
                type="button"
                onClick={() => setActiveStep("edit")}
                className="rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800"
              >
                Edit Materials
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveStep("details")}
                className="rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800"
              >
                Save Material Choices
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
