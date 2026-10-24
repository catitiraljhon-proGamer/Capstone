"use client";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import HouseTypeCards from "@/components/house-designs/house-type-cards";
import { HouseDesignForm } from "@/components/house-designs/house-design-form";
import { HouseDesignGallery } from "@/components/house-designs/house-design-gallery";
import {
  formatPeso,
  getDesignEstimate,
  isDataImage,
  type HouseDesign,
  type HouseDesignStatus,
} from "@/lib/house-design-data";
import { useDesignNavigation } from "@/lib/use-design-navigation";
import { HouseDesignSpecs } from "@/components/house-designs/house-design-specs";
import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import { useHouseDesigns } from "@/lib/house-design-store";
import type { ManagedProfessional } from "@/lib/professionals";
import {
  AlertCircle,
  ArchiveRestore,
  ChevronRight,
  CircleCheck,
  HardHat,
  ImageOff,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

type Step = "types" | "designs" | "create" | "details" | "edit";

/**
 * The designs listed after a card is chosen: one house type, or designs without a current house type. A completed
 * project's design is listed under its own house type, like any other design.
 */
type DesignGroup =
  | { kind: "house-type"; houseType: string }
  | { kind: "unassigned" };

function groupTitle(group: DesignGroup | null) {
  if (!group) return "House Designs";
  return group.kind === "house-type" ? `${group.houseType} House Designs` : "Designs Without a House Type";
}

function groupDescription(group: DesignGroup | null) {
  if (!group) {
    return "Choose a house type, then manage the designs and exterior materials under that category.";
  }
  return group.kind === "unassigned"
    ? "Edit each design and select a house type so customers can find it."
    : "Select a design to review and edit its details and custom items. Completed projects of this house type are saved here as drafts with their cost estimate.";
}

function isInGroup(design: HouseDesign, group: DesignGroup | null, offeredTypes: ReadonlySet<string>) {
  if (!group) return false;
  if (group.kind === "house-type") return design.houseType === group.houseType;
  // A type that is no longer offered has no card, so its designs are listed here instead of nowhere.
  return !design.houseType || (offeredTypes.size > 0 && !offeredTypes.has(design.houseType));
}

function CompletedProjectPanel({
  source,
}: {
  source: NonNullable<HouseDesign["sourceProject"]>;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700">
            <HardHat className="h-4 w-4" aria-hidden="true" />
            Completed Project
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-stone-950">
            Cost Estimate From {source.projectReference}
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Built for {source.customerName}
            {source.estimateReference ? ` under estimate ${source.estimateReference}` : ""}, completed{" "}
            {new Date(source.completedAt).toLocaleDateString("en-PH", { dateStyle: "long" })}.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-semibold text-stone-600">Contract Price</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-red-700">
            {formatPeso(source.contractPrice)}
          </p>
        </div>
      </div>

      {source.lineItems.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Accepted cost estimate for {source.projectReference}</caption>
            <thead>
              <tr className="text-left text-xs font-semibold uppercase text-stone-500">
                <th scope="col" className="border-b border-stone-200 py-2 pr-3">Item</th>
                <th scope="col" className="border-b border-stone-200 px-3 py-2 text-right">Qty</th>
                <th scope="col" className="border-b border-stone-200 px-3 py-2">Unit</th>
                <th scope="col" className="border-b border-stone-200 px-3 py-2 text-right">Unit Price</th>
                <th scope="col" className="border-b border-stone-200 py-2 pl-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {source.lineItems.map((line, index) => (
                <tr key={`${line.item}-${index}`} className="align-top">
                  <td className="border-b border-stone-100 py-2 pr-3">
                    <p className="font-semibold text-stone-950">{line.item}</p>
                    {line.description ? <p className="text-xs text-stone-600">{line.description}</p> : null}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="border-b border-stone-100 px-3 py-2">{line.unit}</td>
                  <td className="border-b border-stone-100 px-3 py-2 text-right tabular-nums">{formatPeso(line.unitPrice)}</td>
                  <td className="border-b border-stone-100 py-2 pl-3 text-right font-semibold tabular-nums">{formatPeso(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4} className="py-2 pr-3 text-right text-sm font-semibold text-stone-600">
                  Total
                </th>
                <td className="py-2 pl-3 text-right font-semibold tabular-nums text-stone-950">
                  {formatPeso(source.subtotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-stone-600">This project has no itemized estimate on record.</p>
      )}
    </section>
  );
}

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
  className = "mb-4",
}: {
  items: { label: string; onClick?: () => void }[];
  className?: string;
}) {
  return (
    <nav aria-label="House design steps" className={className}>
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
    catalog,
    isLoading,
    error: dataError,
    addDesign,
    updateDesign,
    setDesignStatus,
  } = useHouseDesigns({ includeAll: true });
  const [activeStep, setActiveStep] = useState<Step>("types");
  const [selectedGroup, setSelectedGroup] = useState<DesignGroup | null>(null);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  /** For the Designed By list; empty when it could not be loaded, which leaves designs uncredited. */
  const [professionals, setProfessionals] = useState<ManagedProfessional[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/professionals", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ professionals: ManagedProfessional[] }>) : { professionals: [] }))
      .then((payload) => {
        if (active) setProfessionals(payload.professionals);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const selectedHouseType =
    selectedGroup?.kind === "house-type" ? selectedGroup.houseType : null;
  const selectedDesign =
    designs.find((design) => design.id === selectedDesignId) ?? null;
  const designer = professionals.find((professional) => professional.id === selectedDesign?.designedBy);
  const offeredTypes = new Set(catalog.houseTypes.map((houseType) => houseType.heading));
  const filteredDesigns = designs.filter(
    (design) =>
      isInGroup(design, selectedGroup, offeredTypes) &&
      (showArchived ? true : design.status !== "Archived"),
  );
  const archivedCount = designs.filter(
    (design) =>
      isInGroup(design, selectedGroup, offeredTypes) && design.status === "Archived",
  ).length;
  const unassignedCount = designs.filter(
    (design) => isInGroup(design, { kind: "unassigned" }, offeredTypes) && design.status !== "Archived",
  ).length;

  const openGroup = (group: DesignGroup) => {
    setSelectedGroup(group);
    setSelectedDesignId(null);
    goToStep("designs");
  };

  const goToStep = (step: Step) => {
    setActiveStep(step);
    setStatusMessage(null);
    setIsConfirmingArchive(false);
  };

  const goToTypes = () => {
    setSelectedGroup(null);
    setSelectedDesignId(null);
    goToStep("types");
  };

  const openDesign = (design: HouseDesign) => {
    setSelectedDesignId(design.id);
    goToStep("details");
  };
  // Arrow keys and clicks on the photo's sides move through the designs of the open house type.
  const designNavigation = useDesignNavigation(
    activeStep === "details" && selectedDesign ? filteredDesigns : [],
    selectedDesign?.id ?? "",
    openDesign,
  );

  const handleStatusChange = async (status: HouseDesignStatus) => {
    if (!selectedDesign) {
      return;
    }

    try {
      await setDesignStatus(selectedDesign.id, status);
    } catch {
      return;
    }
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
    ...(selectedGroup
      ? [
          {
            label:
              selectedGroup.kind === "house-type"
                ? selectedGroup.houseType
                : groupTitle(selectedGroup),
            onClick: () => goToStep("designs"),
          },
        ]
      : []),
    ...(activeStep === "create" ? [{ label: "New Design" }] : []),
    ...((activeStep === "details" || activeStep === "edit") && selectedDesign
      ? [{ label: selectedDesign.name }]
      : []),
    ...(activeStep === "edit" ? [{ label: "Edit" }] : []),
  ];

  const mainContent = (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      {dataError ? (
        <p
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {dataError}
        </p>
      ) : null}

      {isLoading ? (
        <p className="mb-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Loading house-design records from MongoDB…
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

      {activeStep !== "types" && activeStep !== "designs" ? (
        <Breadcrumb items={breadcrumbItems} />
      ) : null}

      {activeStep === "types" ? (
        <div>
          <h2 className="mb-4 text-base font-semibold tracking-tight text-stone-950">
            Select House Type
          </h2>
          <HouseTypeCards
            houseTypes={catalog.houseTypes}
            onSelect={(houseType) => openGroup({ kind: "house-type", houseType })}
          />
          {unassignedCount > 0 ? (
            <div className="mt-5 flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm text-stone-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                {unassignedCount} {unassignedCount === 1 ? "design has" : "designs have"} no house type yet,
                so customers cannot find {unassignedCount === 1 ? "it" : "them"} by category.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openGroup({ kind: "unassigned" })}
              >
                Review Designs
              </Button>
            </div>
          ) : null}
        </div>
      ) : activeStep === "create" ? (
        <HouseDesignForm
          defaultHouseType={selectedHouseType}
          existingNames={designs.map((design) => design.name)}
          houseTypes={catalog.houseTypes}
          professionals={professionals}
          onCancel={() => goToStep("designs")}
          onSubmit={async (draft) => {
            try {
              const created = await addDesign(draft);
              if (created.houseType) {
                setSelectedGroup({ kind: "house-type", houseType: created.houseType });
              }
              setSelectedDesignId(created.id);
              setActiveStep("details");
              setStatusMessage(
                created.status === "Published"
                  ? `${created.name} was created and published.`
                  : `${created.name} was saved as a draft. Publish it when it is ready for customers.`,
              );
            } catch {
              // The store exposes the server message in the page alert.
            }
          }}
        />
      ) : activeStep === "edit" && selectedDesign ? (
        <HouseDesignForm
          design={selectedDesign}
          existingNames={designs
            .filter((design) => design.id !== selectedDesign.id)
            .map((design) => design.name)}
          houseTypes={catalog.houseTypes}
          professionals={professionals}
          onCancel={() => goToStep("details")}
          onSubmit={async (changes) => {
            try {
              await updateDesign(selectedDesign.id, changes);
              if (selectedGroup?.kind === "house-type" && changes.houseType) {
                setSelectedGroup({ kind: "house-type", houseType: changes.houseType });
              }
              setActiveStep("details");
              setStatusMessage(`${changes.name} was updated.`);
            } catch {
              // The store exposes the server message in the page alert.
            }
          }}
        />
      ) : activeStep === "designs" ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Breadcrumb items={breadcrumbItems} className="" />
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
                        {design.style || design.houseType
                          ? `${design.style || design.houseType} - `
                          : ""}
                        <span className="tabular-nums">{design.area}</span> sqm
                      </p>
                      {design.sourceProject ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700">
                          <HardHat className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          From completed project {design.sourceProject.projectReference}
                        </p>
                      ) : null}
                    </div>
                  </button>

                  {design.status === "Archived" ? (
                    <div className="px-1 pb-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void setDesignStatus(design.id, "Draft").catch(
                            () => undefined,
                          );
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
                {selectedHouseType
                  ? `No designs under ${selectedHouseType} yet.`
                  : "No designs here right now."}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
                {archivedCount > 0
                  ? "All designs here are archived. Turn on Show archived to restore one."
                  : selectedHouseType
                    ? "Create the first design record for this house type. It is saved as a draft until you publish it."
                    : "Create a design record. It is saved as a draft until you publish it."}
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
            <div className="flex flex-wrap items-center gap-3">
              <BackButton type="button" onClick={() => goToStep("designs")} />
            </div>
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
                  Confirm Archive
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
                    Restore as Draft
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
            key={selectedDesign.id}
            navigation={designNavigation}
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
              {designer ? (
                <p className="mt-1 text-xs text-stone-600">Designed by {designer.name}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 text-right shadow-sm">
              <p className="text-sm font-semibold text-stone-600">
                Estimated Project Cost
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-red-700">
                {formatPeso(getDesignEstimate(selectedDesign).estimate)}
              </p>
            </div>
          </div>

          <HouseDesignSpecs design={selectedDesign} className="mt-5" />

          {!selectedDesign.houseType ? (
            <p className="mt-5 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Edit this design and select a house type before publishing it.
            </p>
          ) : null}

          {selectedDesign.sourceProject ? (
            <div className="mt-6">
              <CompletedProjectPanel source={selectedDesign.sourceProject} />
            </div>
          ) : null}

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
      activeLabel="House Design"
      title={groupTitle(selectedGroup)}
      description={groupDescription(selectedGroup)}
      mainContent={mainContent}
    />
  );
}
