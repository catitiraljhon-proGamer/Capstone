import { Check } from "lucide-react";
import type { ConstructionProjectDto, CostEstimateDto } from "@/types/construction";
import type { DesignRequestDto } from "@/types/design-requests";

const blueprintSteps = ["Design Request", "Design Review", "Design Approved", "Cost Estimate", "Blueprint Paid", "Downpayment", "Construction"] as const;
const legacySteps = ["Design Request", "Design Delivered", "Design Fee Paid", "Construction Estimate", "Downpayment", "Construction"] as const;

export function journeySteps(design: DesignRequestDto): readonly string[] {
  return design.workflow === "blueprint" ? blueprintSteps : legacySteps;
}

/** Blueprint designs open the estimate once approved; legacy designs once their design fee is paid. */
export function canRequestEstimate(design: DesignRequestDto) {
  return design.workflow === "blueprint" ? design.status === "Design approved" : design.access === "unlocked";
}

const designStatusText: Record<DesignRequestDto["status"], string> = {
  Pending: "Waiting for admin review", "In review": "Under feasibility review",
  Approved: "Approved · Design in progress", "In customer review": "Design ready for your review",
  "Changes requested": "Revising your design", "Design approved": "Design approved",
  Rejected: "Request declined", Completed: "Design delivered",
};

const downpaymentDone = (project?: ConstructionProjectDto) =>
  Boolean(project && (project.milestones[0]?.status === "Paid" || ["Scheduled", "Active", "Completed"].includes(project.status)));

/** Index of the first journey step that is not finished yet; equals the step count when everything is done. */
export function journeyProgress(design: DesignRequestDto, estimate?: CostEstimateDto, project?: ConstructionProjectDto) {
  const done = design.workflow === "blueprint"
    ? [
      !["Pending", "In review", "Rejected"].includes(design.status),
      design.versions.length > 0,
      design.status === "Design approved",
      estimate?.status === "Accepted",
      design.access === "unlocked",
      downpaymentDone(project),
      project?.status === "Completed",
    ]
    : [
      design.status === "Approved" || design.status === "Completed",
      design.status === "Completed",
      design.access === "unlocked",
      estimate?.status === "Accepted",
      downpaymentDone(project),
      project?.status === "Completed",
    ];
  const first = done.findIndex((step) => !step);
  return first === -1 ? done.length : first;
}

function estimateStageText(estimate?: CostEstimateDto) {
  if (!estimate) return "Ready for construction estimation";
  if (estimate.status === "Sent") return "Estimate ready for your review";
  if (estimate.status === "Revision requested") return "Revision requested";
  if (estimate.status === "Accepted") return "Estimate accepted";
  return "Preparing cost estimate";
}

/** Short label for where this design currently stands. */
export function journeyStageText(design: DesignRequestDto, estimate?: CostEstimateDto, project?: ConstructionProjectDto) {
  if (design.workflow === "blueprint") {
    if (design.status !== "Design approved") return designStatusText[design.status];
    if (estimate?.status !== "Accepted") return estimateStageText(estimate);
    if (design.access === "awaiting-invoice") return "Awaiting blueprint fee invoice";
    if (design.access === "payment-required") return design.invoice?.pending ? "Blueprint payment under verification" : "Blueprint fee payment required";
    if (project) return project.status === "Awaiting downpayment" ? "Awaiting downpayment" : `Project ${project.status.toLowerCase()}`;
    return "Blueprint paid";
  }
  if (design.access === "awaiting-invoice") return "Design Ready · Awaiting Fee Invoice";
  if (design.access === "payment-required") return design.invoice?.pending ? "Design fee payment under verification" : "Design fee payment required";
  if (design.access !== "unlocked") return designStatusText[design.status];
  if (project) return project.status === "Awaiting downpayment" ? "Awaiting downpayment" : project.status === "Pending" ? "Project in progress" : `Project ${project.status.toLowerCase()}`;
  return estimateStageText(estimate);
}

export function JourneyStepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className={`grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 lg:gap-2 ${steps.length > 6 ? "lg:grid-cols-7" : "lg:grid-cols-6"}`} aria-label="Dream house journey">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} aria-current={active ? "step" : undefined} className="min-w-0">
            <div className={`h-1.5 rounded-full ${done || active ? "bg-red-700" : "bg-rose-200"}`} />
            <div className="mt-2 flex items-start gap-1.5">
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${done ? "bg-red-700 text-white" : active ? "bg-red-700 text-white ring-2 ring-rose-200" : "bg-stone-100 text-stone-500"}`}>
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className={`min-w-0 break-words text-xs leading-4 ${active ? "font-semibold text-stone-950" : done ? "font-medium text-stone-700" : "text-stone-500"}`}>{step}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
