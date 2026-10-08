"use client";

import { CheckCircle2, HardHat, LockKeyhole } from "lucide-react";
import { ConstructionEstimateCard } from "@/components/customer/construction-estimate-card";
import { ConstructionProjectCard } from "@/components/customer/construction-project-card";
import { ConstructionRequestForm } from "@/components/customer/construction-request-form";
import { dateOrDash, Eyebrow } from "@/components/customer/construction-shared";
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

/** The construction part of a Dream House card; opens only once the design is unlocked. */
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
  if (design.access !== "unlocked") {
    // A declined request never reaches construction, so the payment hint would mislead.
    if (design.status === "Rejected") return null;
    return (
      <section aria-label="Construction" className="p-5">
        <p className="flex items-start gap-2 text-sm leading-6 text-stone-500">
          <LockKeyhole className="mt-1 h-4 w-4 shrink-0" />
          Construction estimation opens after your design fee is fully paid.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Construction" className="space-y-4 p-5">
      <Eyebrow>Construction</Eyebrow>
      {!estimate && !starting && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-rose-50/60 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-950">Ready to build this design?</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-stone-600">G4 Builders will prepare an itemized cost estimate with a payment schedule for you to review. Nothing is charged until you accept it.</p>
          </div>
          <Button className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" onClick={onStart}><HardHat className="mr-2 h-4 w-4 shrink-0" />Proceed to construction cost estimation</Button>
        </div>
      )}
      {!estimate && starting && <ConstructionRequestForm design={design} showDesignFacts={false} onCancel={onCancelStart} onSubmitted={onSubmitted} />}
      {estimate && project && <AcceptedEstimateSummary estimate={estimate} />}
      {estimate && !project && <ConstructionEstimateCard estimate={estimate} highlighted={false} onChanged={onChanged} />}
      {project && <ConstructionProjectCard project={project} />}
    </section>
  );
}
