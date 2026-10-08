import { Check } from "lucide-react";
import type { ConstructionProjectDto, CostEstimateDto } from "@/types/construction";
import type { DesignRequestDto } from "@/types/design-requests";

export const journeySteps = ["Design request", "Design delivered", "Design fee paid", "Construction estimate", "Downpayment", "Construction"] as const;

const designStatusText: Record<DesignRequestDto["status"], string> = {
  Pending: "Waiting for admin review", "In review": "Under feasibility review",
  Approved: "Approved · Design in progress", Rejected: "Request declined", Completed: "Design delivered",
};

/** Index of the first journey step that is not finished yet; equals the step count when everything is done. */
export function journeyProgress(design: DesignRequestDto, estimate?: CostEstimateDto, project?: ConstructionProjectDto) {
  const done = [
    design.status === "Approved" || design.status === "Completed",
    design.status === "Completed",
    design.access === "unlocked",
    estimate?.status === "Accepted",
    Boolean(project && (project.milestones[0]?.status === "Paid" || ["Scheduled", "Active", "Completed"].includes(project.status))),
    project?.status === "Completed",
  ];
  const first = done.findIndex((step) => !step);
  return first === -1 ? journeySteps.length : first;
}

/** Short label for where this design currently stands. */
export function journeyStageText(design: DesignRequestDto, estimate?: CostEstimateDto, project?: ConstructionProjectDto) {
  if (design.access === "awaiting-invoice") return "Design ready · Awaiting fee invoice";
  if (design.access === "payment-required") return design.invoice?.pending ? "Design fee payment under verification" : "Design fee payment required";
  if (design.access !== "unlocked") return designStatusText[design.status];
  if (project) return project.status === "Awaiting downpayment" ? "Awaiting downpayment" : project.status === "Pending" ? "Project in progress" : `Project ${project.status.toLowerCase()}`;
  if (!estimate) return "Ready for construction estimation";
  if (estimate.status === "Sent") return "Estimate ready for your review";
  if (estimate.status === "Revision requested") return "Revision requested";
  if (estimate.status === "Accepted") return "Estimate accepted";
  return "Preparing cost estimate";
}

export function JourneyStepper({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2" aria-label="Dream house journey">
      {journeySteps.map((step, index) => {
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
