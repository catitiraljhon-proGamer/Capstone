"use client";

import { CheckCircle2, HardHat, LockKeyhole } from "lucide-react";
import { ConstructionEstimateCard } from "@/components/customer/construction-estimate-card";
import { ConstructionProjectCard } from "@/components/customer/construction-project-card";
import { ConstructionRequestForm } from "@/components/customer/construction-request-form";
import { dateOrDash, Eyebrow } from "@/components/customer/construction-shared";
import { canRequestEstimate } from "@/components/customer/dream-house-journey";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/house-design-data";
import type { ConstructionProjectDto, CostEstimateDto } from "@/types/construction";
import type { DesignRequestDto } from "@/types/design-requests";

/** One line standing in for an accepted estimate once its project is shown. */
function AcceptedEstimateSummary({ estimate }: { estimate: CostEstimateDto }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-rose-50 p-4">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
      <p className="min-w-0 text-sm leading-6 text-stone-700">
        <span className="font-semibold text-red-900">Estimate {estimate.reference} accepted{estimate.acceptedAt ? ` ${dateOrDash(estimate.acceptedAt)}` : ""}</span>
        {" · "}Contract total {formatPeso(estimate.total)}{estimate.downpaymentPercent ? ` · ${estimate.downpaymentPercent}% downpayment` : ""}
      </p>
    </div>
  );
}

/** The optional construction part of a Dream House card; opens once the blueprint (or legacy design fee) is paid. */
export function DreamHouseConstructionSection({ design, estimate, project, starting, onStart, onCancelStart, onSubmitted, onChanged }: {
  design: DesignRequestDto;
  estimate?: CostEstimateDto;
  project?: ConstructionProjectDto;
  starting: boolean;
  onStart: () => void;
  onCancelStart: () => void;
  onSubmitted: (estimate: CostEstimateDto) => void;
  onChanged: (message?: string) => void;
}) {
  // Estimates requested before the blueprint came first stay visible.
  if (!canRequestEstimate(design) && !estimate) {
    // A declined request never reaches construction, so the hint would mislead.
    if (design.status === "Rejected") return null;
    return (
      <section aria-label="Construction" className="p-5">
        <p className="flex items-start gap-2 text-sm leading-6 text-stone-500">
          <LockKeyhole className="mt-1 h-4 w-4 shrink-0" />
          {design.workflow === "blueprint"
            ? "Construction is optional. It opens after your blueprint fee is fully paid."
            : "Construction estimation opens after your design fee is fully paid."}
        </p>
      </section>
    );
  }
  const blueprintPending = design.workflow === "blueprint" && design.access !== "unlocked";

  return (
    <section aria-label="Construction" className="space-y-4 p-5">
      <Eyebrow>Construction</Eyebrow>
      {!estimate && !starting && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-rose-50/60 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-950">Want G4 Builders to build this design? (Optional)</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-stone-600">Your blueprint is yours to keep either way. If you want us to build it, we will prepare an itemized cost estimate with a payment schedule for you to review. Nothing is charged until you accept it.</p>
          </div>
          <Button className="min-h-11" onClick={onStart}><HardHat className="mr-2 h-4 w-4 shrink-0" />Proceed to Construction</Button>
        </div>
      )}
      {!estimate && starting && <ConstructionRequestForm design={design} showDesignFacts={false} onCancel={onCancelStart} onSubmitted={onSubmitted} />}
      {estimate && project && <AcceptedEstimateSummary estimate={estimate} />}
      {project && blueprintPending && (
        <p className="flex items-start gap-2 rounded-lg bg-stone-50 p-4 text-sm leading-6 text-stone-600">
          <LockKeyhole className="mt-1 h-4 w-4 shrink-0" />
          Your downpayment invoice is issued after the blueprint fee above is fully paid and verified.
        </p>
      )}
      {estimate && !project && <ConstructionEstimateCard estimate={estimate} highlighted={false} onChanged={onChanged} />}
      {project && <ConstructionProjectCard project={project} />}
    </section>
  );
}
