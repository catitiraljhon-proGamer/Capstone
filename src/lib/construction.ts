import { fromCentavos, toCentavos } from "@/lib/billing";
import type { EstimateLineItemInput, MilestoneTemplate, PaymentTerms, ProjectStatus, WorkStage } from "@/types/construction";

export const MIN_DOWNPAYMENT_PERCENT = 30;

/** The one bill of a Full Payment project, also its invoice label. */
export const FULL_PAYMENT_LABEL = "Full Payment";

export const paymentTermsLabel = (terms: PaymentTerms) => (terms === "full" ? "Full Payment" : "Installment");

/** A Full Payment project waits for its "full payment"; every other status reads the same for both terms. */
export const projectStatusLabel = (status: ProjectStatus, terms: PaymentTerms) =>
  status === "Awaiting downpayment" && terms === "full" ? "Awaiting full payment" : status;

/**
 * An installment downpayment is at least the minimum and below 100%: paying the whole contract at once is Full
 * Payment, so it is never called a downpayment. Returns an error message, or null.
 */
export function installmentDownpaymentError(percent: number, minimum = MIN_DOWNPAYMENT_PERCENT) {
  if (percent < minimum) return `Your downpayment must be at least ${minimum}% of the contract total.`;
  if (percent >= 100) return "An installment downpayment must be below 100%. To pay the whole contract at once, choose Full Payment.";
  return null;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const lineAmount = (quantity: number, unitPrice: number) =>
  fromCentavos(Math.round(quantity * toCentavos(unitPrice)));

/**
 * The contract total is the sum of the scope-of-work amounts, exact to the centavo. G4 Builders Inc is VAT-exempt
 * with the BIR, so no VAT is added.
 */
export function estimateTotals(lines: Pick<EstimateLineItemInput, "quantity" | "unitPrice">[]) {
  const total = fromCentavos(lines.reduce((sum, line) => sum + toCentavos(lineAmount(line.quantity, line.unitPrice)), 0));
  return { subtotal: total, total };
}

const defaultStages: Omit<MilestoneTemplate, "targetDate">[] = [
  { label: "Downpayment / Mobilization", percentage: 30, description: "Due on acceptance. Covers permits, mobilization, and first materials. Construction starts after this is verified." },
  { label: "Structural Works", percentage: 30, description: "Billed when the foundation, columns, beams, and slabs are complete." },
  { label: "Roofing, Masonry & Rough-Ins", percentage: 30, description: "Billed when the roof, walls, and plumbing/electrical rough-ins are complete." },
  { label: "Completion & Turnover", percentage: 10, description: "Billed after final inspection, punch-list, and handover of the house." },
];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * The 30/30/30/10 progress-billing template. Target dates run from the
 * preferred start (downpayment) to the needed-by date (turnover).
 */
export function defaultScheduleTemplate(startDate?: string | null, neededBy?: string | null): MilestoneTemplate[] {
  if (!startDate || !neededBy || neededBy <= startDate) {
    return defaultStages.map((stage) => ({ ...stage, targetDate: startDate ?? "" }));
  }
  const span = Math.round((Date.parse(neededBy) - Date.parse(startDate)) / 86_400_000);
  const offsets = [0, Math.round(span * 0.35), Math.round(span * 0.7), span];
  return defaultStages.map((stage, index) => ({ ...stage, targetDate: addDays(startDate, offsets[index]) }));
}

/** Returns an error message, or null when the template can be sent to the customer. */
export function scheduleTemplateError(template: MilestoneTemplate[]) {
  if (template.length < 2) return "Add the downpayment and at least one progress milestone.";
  if (template.some((row) => !row.label.trim())) return "Every milestone needs a label.";
  if (template.some((row) => !(row.percentage > 0))) return "Every milestone needs a percentage above 0%.";
  if (template[0].percentage < MIN_DOWNPAYMENT_PERCENT) return `The downpayment must be at least ${MIN_DOWNPAYMENT_PERCENT}%.`;
  if (Math.abs(template.reduce((sum, row) => sum + row.percentage, 0) - 100) > 0.001) return "Milestone percentages must add up to 100%.";
  if (template.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.targetDate))) return "Set a target date for every milestone.";
  if (template.some((row, index) => index > 0 && row.targetDate < template[index - 1].targetDate)) return "Milestone target dates must be in order.";
  return null;
}

/**
 * Applies the customer's downpayment choice to the template. A larger
 * downpayment scales the remaining milestones down proportionally; the last
 * milestone absorbs centavo rounding so amounts always add up to the total.
 */
export function buildPaymentSchedule(total: number, template: MilestoneTemplate[], downpaymentPercent: number) {
  if (downpaymentPercent < MIN_DOWNPAYMENT_PERCENT || downpaymentPercent > 100) {
    throw new Error(`The downpayment must be between ${MIN_DOWNPAYMENT_PERCENT}% and 100%.`);
  }
  const totalCentavos = toCentavos(total);
  const rest = template.slice(1);
  const restTemplateShare = rest.reduce((sum, row) => sum + row.percentage, 0);
  const remainingPercent = 100 - downpaymentPercent;
  const percentages = [
    downpaymentPercent,
    ...rest.map((row) => (restTemplateShare > 0 ? (row.percentage / restTemplateShare) * remainingPercent : 0)),
  ];
  let allocated = 0;
  const rows = template.map((row, index) => {
    const isLast = index === template.length - 1;
    const centavos = isLast ? totalCentavos - allocated : Math.round((totalCentavos * percentages[index]) / 100);
    allocated += centavos;
    return { ...row, percentage: round2(percentages[index]), amount: fromCentavos(centavos), isDownpayment: index === 0 };
  });
  // A 100% downpayment leaves zero-amount milestones; keep only billable rows.
  return rows.filter((row) => row.isDownpayment || row.amount > 0);
}

/**
 * Full Payment bills the whole contract total once, due on the first stage's date. The row is marked as the first
 * payment (`isDownpayment`), so it is issued on acceptance and moves the project to Scheduled once fully paid.
 */
export function buildFullPaymentSchedule(total: number, template: MilestoneTemplate[]) {
  return [{
    label: FULL_PAYMENT_LABEL,
    description: "The whole contract total in one payment. Construction is scheduled once it is verified.",
    percentage: 100,
    amount: fromCentavos(toCentavos(total)),
    targetDate: template[0]?.targetDate ?? "",
    isDownpayment: true,
  }];
}

/** The first stage without its downpayment wording: "Downpayment / Mobilization" becomes "Mobilization". */
export function workStageLabel(label: string) {
  return label.replace(/^\s*down\s*-?\s*payment\b[\s/&,:;–—-]*/i, "").trim() || "Mobilization";
}

/** A Full Payment project keeps the estimate's stages as its work schedule, without amounts. */
export function workStagesOf(template: MilestoneTemplate[]): WorkStage[] {
  return template.map((row, index) => ({ label: index === 0 ? workStageLabel(row.label) : row.label.trim(), targetDate: row.targetDate }));
}
