import { Check } from "lucide-react";
import { formatPeso } from "@/lib/house-design-data";
import type { ConstructionProjectDto, CostEstimateDto } from "@/types/construction";
import type { DesignRequestDto } from "@/types/design-requests";

/** Construction is optional and opens once the blueprint (or, for legacy designs, the design fee) is fully paid. */
export function canRequestEstimate(design: DesignRequestDto) {
  return design.access === "unlocked";
}

/** Requests the admin has not accepted yet stay in Design Requests; Dream House starts once a design is underway. */
export function isDreamHouse(design: DesignRequestDto) {
  return !["Pending", "In review", "Rejected"].includes(design.status);
}

/** Display name: the chosen design, or the size and house type of a custom request. */
export function dreamHouseName(design: DesignRequestDto) {
  return design.selectedDesign?.name ?? [`${design.floorArea.toLocaleString("en-PH")} sqm`, design.houseType, "house"].filter(Boolean).join(" ");
}

export type JourneyStage = { label: string; optional?: boolean };

export function journeyStages(design: DesignRequestDto): JourneyStage[] {
  return [
    { label: "Design" },
    { label: design.workflow === "blueprint" ? "Blueprint" : "Design fee" },
    { label: "Estimate", optional: true },
    { label: "Construction", optional: true },
  ];
}

/** Index of the stage in progress; equals the stage count when the house is finished. */
export function journeyProgress(design: DesignRequestDto, estimate?: CostEstimateDto, project?: ConstructionProjectDto) {
  const designDone = design.workflow === "blueprint" ? design.status === "Design approved" : design.status === "Completed";
  const done = [designDone, design.access === "unlocked", estimate?.status === "Accepted", project?.status === "Completed"];
  const first = done.findIndex((step) => !step);
  return first === -1 ? done.length : first;
}

export type NextStep = {
  /** action: the customer must do something; waiting: G4 Builders is working; done: nothing is pending. */
  tone: "action" | "waiting" | "done";
  title: string;
  detail: string;
  action?: { label: string; href?: string; target?: string };
};

const billingLink = (invoiceId: string) => `/customer/billing?invoice=${encodeURIComponent(invoiceId)}`;

function constructionStep(design: DesignRequestDto, estimate?: CostEstimateDto, project?: ConstructionProjectDto): NextStep | null {
  if (project) {
    if (project.status === "Completed") {
      return { tone: "done", title: "Your house is complete", detail: "Thank you for building with G4 Builders Inc. Your billing history stays in Billing Status." };
    }
    const due = project.milestones.find((milestone) => milestone.invoice && !["Draft", "Ready", "Void"].includes(milestone.invoice.status) && milestone.invoice.balance > 0);
    if (due?.invoice) {
      return {
        tone: "action", title: `Payment due: ${due.label}`,
        detail: `${formatPeso(due.invoice.balance)} is due for ${due.label}. Pay online or upload your proof of payment.`,
        action: { label: "Pay Now", href: billingLink(due.invoice.id) },
      };
    }
    if (project.status === "Awaiting downpayment") {
      return { tone: "waiting", title: "Preparing your downpayment invoice", detail: "The Billing Clerk will issue it shortly. You will be notified when it is ready to pay." };
    }
    if (project.status === "On hold") return { tone: "waiting", title: "Construction is on hold", detail: "G4 Builders will contact you before work resumes." };
    return { tone: "waiting", title: "Construction in progress", detail: "G4 Builders is building your house. The next billing is issued when the next milestone is reached.", action: { label: "View Project", target: `project-${project.id}` } };
  }
  if (estimate) {
    if (estimate.status === "Sent") {
      return { tone: "action", title: "Review your cost estimate", detail: "Accept it to start construction, or ask G4 Builders for a revision. Reviewing is free.", action: { label: "Review Estimate", target: `estimate-${estimate.id}` } };
    }
    if (estimate.status === "Accepted") return { tone: "waiting", title: "Setting up your project", detail: "Your estimate is accepted. Your project and downpayment invoice are being prepared." };
    return { tone: "waiting", title: estimate.status === "Revision requested" ? "Revising your estimate" : "Preparing your cost estimate", detail: "G4 Builders is pricing your construction. You will be notified when it is ready to review." };
  }
  if (!canRequestEstimate(design)) return null;
  return {
    tone: "done",
    title: design.workflow === "blueprint" ? "Your blueprint is ready" : "Your design is ready",
    detail: design.workflow === "blueprint"
      ? "Download it or pick up a printed copy at our office. If you want G4 Builders to build it, you can proceed to construction."
      : "View your design below. If you want G4 Builders to build it, you can proceed to construction.",
    action: { label: design.workflow === "blueprint" ? "Get Your Blueprint" : "View Design", target: `${design.workflow === "blueprint" ? "blueprint" : "design"}-${design.id}` },
  };
}

/** The one thing to do (or wait for) right now on this house. */
export function nextStep(design: DesignRequestDto, estimate?: CostEstimateDto, project?: ConstructionProjectDto): NextStep {
  const later = constructionStep(design, estimate, project);
  if (later) return later;
  if (design.access === "payment-required") {
    const fee = design.workflow === "blueprint" ? "blueprint fee" : "design fee";
    return design.invoice?.pending
      ? { tone: "waiting", title: "Verifying your payment", detail: `The Billing Clerk is checking your ${fee} payment. It unlocks once the full amount is verified.` }
      : {
        tone: "action", title: `Pay the ${fee}`,
        detail: `${formatPeso(design.invoice?.balance ?? 0)} remaining. It unlocks once the full amount is verified.`,
        action: { label: "Pay Now", href: billingLink(design.invoice?.id ?? "") },
      };
  }
  if (design.access === "awaiting-invoice") {
    return design.workflow === "blueprint"
      ? { tone: "waiting", title: "Preparing your blueprint", detail: "G4 Builders is finishing your blueprint. Its fee invoice will appear in Billing Status." }
      : { tone: "waiting", title: "Preparing your design fee invoice", detail: "The Billing Clerk will issue it shortly." };
  }
  switch (design.status) {
    case "In customer review":
      return { tone: "action", title: "Review your design", detail: "Approve the design and floor plan, or tell G4 Builders what to change. Reviews are free.", action: { label: "Review Design", target: `design-${design.id}` } };
    case "Changes requested":
      return { tone: "waiting", title: "Revising your design", detail: "G4 Builders is making the changes you asked for. You will review the new version here." };
    default:
      return { tone: "waiting", title: "Preparing your design", detail: "G4 Builders is drawing your design and floor plan. You will review them here for free." };
  }
}

export function JourneyStepper({ stages, current }: { stages: JourneyStage[]; current: number }) {
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4" aria-label="Dream house progress">
      {stages.map((stage, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={stage.label} aria-current={active ? "step" : undefined} className="min-w-0">
            <div className={`h-1.5 rounded-full ${done || active ? "bg-red-700" : "bg-rose-200"}`} />
            <div className="mt-2 flex items-start gap-1.5">
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${done ? "bg-red-700 text-white" : active ? "bg-red-700 text-white ring-2 ring-rose-200" : "bg-stone-100 text-stone-500"}`}>
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className={`min-w-0 break-words text-xs leading-4 ${active ? "font-semibold text-stone-950" : done ? "font-medium text-stone-700" : "text-stone-500"}`}>
                {stage.label}
                {stage.optional && !done ? <span className="block font-normal text-stone-400">Optional</span> : null}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
