"use client";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import ColorChangeCards from "@/components/ui/color-change-card";
import { HouseDesignForm } from "@/components/ui/house-design-form";
import { HouseDesignGallery } from "@/components/ui/house-design-gallery";
import {
  formatPeso,
  getExteriorEstimate,
  isDataImage,
  normalizeSelections,
  type HouseDesign,
  type HouseDesignStatus,
} from "@/components/ui/house-design-data";
import { ProjectExteriorEstimatePanel } from "@/components/ui/project-exterior-estimate-panel";
import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import { useHouseDesigns } from "@/lib/house-design-store";
import {
  AlertCircle,
  ArchiveRestore,
  ChevronRight,
  CircleCheck,
  ImageOff,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type Step = "types" | "designs" | "create" | "details" | "edit";

const statusBadgeClass: Record<HouseDesignStatus, string> = {
  Draft: "bg-stone-100 text-stone-700",
  Published: "bg-red-50 text-red-700",
  Archived: "bg-stone-200 text-stone-700",
};

function StatusBadge({ status }: { status: HouseDesignStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${statusBadgeClass[status]}`}
    >
      {status}
    </span>
  );
}

function Breadcrumb({
  items,
}: {
  items: { label: string; onClick?: () => void }[];
}) {
  return (
    <nav aria-label="House design steps" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label} className="flex items-center gap-1">
              {item.onClick && !isLast ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="rounded px-1 font-medium text-stone-600 underline-offset-4 transition hover:text-red-700 hover:underline focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className="px-1 font-semibold text-stone-950"
                  aria-current={isLast ? "step" : undefined}
                >
                  {item.label}
                </span>
              )}
              {isLast ? null : (
                <ChevronRight
                  className="h-4 w-4 text-stone-400"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DesignCardImage({
  design,
  heightClass,
}: {
  design: HouseDesign;
  heightClass: string;
}) {
  const cover = design.images[0];

  return (
    <div className={`relative overflow-hidden rounded-xl ${heightClass}`}>
      {cover ? (
        <Image
          src={cover}
          alt={`${design.name} exterior preview`}
          fill
          unoptimized={isDataImage(cover)}
          className="object-cover"
          sizes="(min-width: 1024px) 25vw, 100vw"
        />
      ) : (
        <div className="grid h-full place-items-center bg-stone-100">
          <ImageOff className="h-6 w-6 text-stone-400" aria-hidden="true" />
        </div>
      )}
      {design.images.length > 1 ? (
        <span className="absolute bottom-2 right-2 rounded-md bg-stone-950/70 px-2 py-0.5 text-xs font-semibold text-white">
          {design.images.length} photos
        </span>
      ) : null}
    </div>
  );
}

export function AdminHouseDesignManager() {
  const {
    designs,
    storageError,
    addDesign,
    updateDesign,
    setDesignStatus,
  } = useHouseDesigns();
  const [activeStep, setActiveStep] = useState<Step>("types");
  const [selectedHouseType, setSelectedHouseType] = useState<string | null>(null);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedDesign =
    designs.find((design) => design.id === selectedDesignId) ?? null;
  const filteredDesigns = designs.filter(
    (design) =>
      design.houseType === selectedHouseType &&
      (showArchived ? true : design.status !== "Archived"),
  );
  const archivedCount = designs.filter(
    (design) =>
      design.houseType === selectedHouseType && design.status === "Archived",
  ).length;

  const goToStep = (step: Step) => {
    setActiveStep(step);
    setStatusMessage(null);
    setIsConfirmingArchive(false);
  };

  const goToTypes = () => {
    setSelectedHouseType(null);
    setSelectedDesignId(null);
    goToStep("types");
  };

  const openDesign = (design: HouseDesign) => {
    setSelectedDesignId(design.id);
    goToStep("details");
  };

  const handleStatusChange = (status: HouseDesignStatus) => {
    if (!selectedDesign) {
      return;
    }

    setDesignStatus(selectedDesign.id, status);
    setIsConfirmingArchive(false);

    if (status === "Archived") {
      setSelectedDesignId(null);
      setActiveStep("designs");
      setShowArchived(true);
      setStatusMessage(
        `${selectedDesign.name} was archived. It is listed under Show archived and can be restored.`,
      );
      return;
    }

    setStatusMessage(
      status === "Published"
        ? `${selectedDesign.name} is now published and visible to customers.`
        : `${selectedDesign.name} is a draft and hidden from customers.`,
    );
  };

  const breadcrumbItems = [
    { label: "House Designs", onClick: goToTypes },
    ...(selectedHouseType
      ? [{ label: selectedHouseType, onClick: () => goToStep("designs") }]
      : []),
    ...(activeStep === "create" ? [{ label: "New design" }] : []),
    ...((activeStep === "details" || activeStep === "edit") && selectedDesign
      ? [{ label: selectedDesign.name }]
      : []),
    ...(activeStep === "edit" ? [{ label: "Edit" }] : []),
  ];

  const mainContent = (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      {storageError ? (
        <p
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {storageError}
        </p>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage ?? ""}
      </p>

      {statusMessage ? (
        <p className="mb-5 flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700">
          <CircleCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-red-700"
            aria-hidden="true"
          />
          {statusMessage}
        </p>
      ) : null}

      {activeStep !== "types" ? <Breadcrumb items={breadcrumbItems} /> : null}

      {activeStep === "types" ? (
        <div>
          <div className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight text-stone-950">
              Select House Type
            </h1>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Admin can choose a house type first, then manage the designs and
              exterior materials under that category.
            </p>
          </div>
          <ColorChangeCards
            onSelect={(houseType) => {
              setSelectedHouseType(houseType);
              setSelectedDesignId(null);
              goToStep("designs");
            }}
          />
        </div>
      ) : activeStep === "create" ? (
        <HouseDesignForm
          defaultHouseType={selectedHouseType}
          existingNames={designs.map((design) => design.name)}
          onCancel={() => goToStep("designs")}
          onSubmit={(draft) => {
            const created = addDesign(draft);
            setSelectedHouseType(created.houseType);
            setSelectedDesignId(created.id);
            setActiveStep("details");
            setStatusMessage(
              created.status === "Published"
                ? `${created.name} was created and published.`
                : `${created.name} was saved as a draft. Publish it when it is ready for customers.`,
            );
          }}
        />
      ) : activeStep === "edit" && selectedDesign ? (
        <HouseDesignForm
          design={selectedDesign}
          existingNames={designs
            .filter((design) => design.id !== selectedDesign.id)
            .map((design) => design.name)}
          onCancel={() => goToStep("details")}
          onSubmit={(changes) => {
            updateDesign(selectedDesign.id, changes);
            setSelectedHouseType(changes.houseType);
            setActiveStep("details");
            setStatusMessage(`${changes.name} was updated.`);
          }}
        />
      ) : activeStep === "designs" ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-stone-950">
                {selectedHouseType} House Designs
              </h1>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                Select a design to review its details and exterior materials.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 accent-red-700"
                />
                Show archived
                {archivedCount > 0 ? ` (${archivedCount})` : ""}
              </label>
              <Button type="button" onClick={() => goToStep("create")}>
                Add New Design
              </Button>
            </div>
          </div>

          {filteredDesigns.length > 0 ? (
            <ul className="mt-5 columns-1 gap-4 sm:columns-2 xl:columns-3">
              {filteredDesigns.map((design, designIndex) => (
                <li
                  key={design.id}
                  className="mb-4 break-inside-avoid rounded-xl bg-white"
                >
                  <button
                    type="button"
                    onClick={() => openDesign(design)}
                    className="block w-full overflow-hidden rounded-xl text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600"
                    aria-label={`Open ${design.name}, ${design.status}`}
                  >
                    <DesignCardImage
                      design={design}
                      heightClass={
                        designIndex % 3 === 0
                          ? "h-56"
                          : designIndex % 3 === 1
                            ? "h-72"
                            : "h-48"
                      }
                    />
                    <div className="px-1 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-sm font-semibold tracking-tight text-stone-950">
                          {design.name}
                        </h2>
                        <StatusBadge status={design.status} />
                      </div>
                      <p className="mt-1 text-xs text-stone-600">
                        {design.style ?? design.houseType} -{" "}
                        <span className="tabular-nums">{design.area}</span> sqm
                      </p>
                    </div>
                  </button>

                  {design.status === "Archived" ? (
                    <div className="px-1 pb-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDesignStatus(design.id, "Draft");
                          setStatusMessage(
                            `${design.name} was restored as a draft. Publish it to show it to customers.`,
                          );
                        }}
                      >
                        <ArchiveRestore
                          className="mr-2 h-4 w-4"
                          aria-hidden="true"
                        />
                        Restore
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-stone-200 p-8 text-center">
              <p className="text-sm font-semibold text-stone-950">
                No designs under {selectedHouseType} yet.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
                {archivedCount > 0
                  ? "All designs for this house type are archived. Turn on Show archived to restore one."
                  : "Create the first design record for this house type. It is saved as a draft until you publish it."}
              </p>
              <Button
                type="button"
                className="mt-4"
                onClick={() => goToStep("create")}
              >
                Add New Design
              </Button>
            </div>
          )}
        </>
      ) : selectedDesign ? (
        <div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <BackButton type="button" onClick={() => goToStep("designs")} />
            {isConfirmingArchive ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-stone-700">
                  Archive {selectedDesign.name}? Customers will stop seeing it.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsConfirmingArchive(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => handleStatusChange("Archived")}
                >
                  Confirm archive
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={selectedDesign.status} />

                {selectedDesign.status === "Archived" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleStatusChange("Draft")}
                  >
                    <ArchiveRestore
                      className="mr-2 h-4 w-4"
                      aria-hidden="true"
                    />
                    Restore as draft
                  </Button>
                ) : null}

                {selectedDesign.status === "Published" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleStatusChange("Draft")}
                  >
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleStatusChange("Published")}
                  >
                    Publish
                  </Button>
                )}

                {selectedDesign.status === "Archived" ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsConfirmingArchive(true)}
                  >
                    Archive
                  </Button>
                )}
              </div>
            )}
          </div>

          <HouseDesignGallery
            images={selectedDesign.images}
            name={selectedDesign.name}
          />

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
                {selectedDesign.name}
              </h1>
              {selectedDesign.notes ? (
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {selectedDesign.notes}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-stone-600">
                Added by {selectedDesign.createdBy} on{" "}
                {new Date(selectedDesign.createdAt).toLocaleDateString("en-PH")}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 text-right shadow-sm">
              <p className="text-sm font-semibold text-stone-600">
                Estimated Project Cost
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-red-700">
                {formatPeso(
                  getExteriorEstimate(
                    selectedDesign,
                    normalizeSelections(selectedDesign.defaultSelections),
                  ).revisedEstimate,
                )}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <ProjectExteriorEstimatePanel
              design={selectedDesign}
              selections={normalizeSelections(selectedDesign.defaultSelections)}
              editorRole="Admin"
            />
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
            <Button type="button" onClick={() => goToStep("edit")}>
              Edit Design
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <AdminSectionPage
      activeLabel="House Designs"
      title={
        selectedHouseType ? `${selectedHouseType} House Designs` : "House Designs"
      }
      description={
        selectedHouseType
          ? "Select a design to review and edit its details, materials, and custom items."
          : "Review house design submissions and design-related project records."
      }
      mainContent={mainContent}
    />
  );
}
