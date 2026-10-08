import Link from "next/link";
import { Check, HardHat } from "lucide-react";
import { BillingPanel } from "@/components/billing/billing-primitives";
import { dateOrDash, Eyebrow, Fact, ScheduleTable } from "@/components/customer/construction-shared";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/house-design-data";
import type { ConstructionProjectDto, PaymentMilestoneDto } from "@/types/construction";

const steps = ["Awaiting downpayment", "Scheduled", "Active", "Completed"] as const;

function stepIndex(project: ConstructionProjectDto) {
  const index = steps.indexOf(project.status as (typeof steps)[number]);
  if (index >= 0) return index;
  // On hold and legacy projects: if the downpayment is in, the project has at least been scheduled.
  return project.milestones[0]?.status === "Paid" ? 1 : 0;
}

function Stepper({ project }: { project: ConstructionProjectDto }) {
  const current = stepIndex(project);
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-2" aria-label="Project progress">
      {steps.map((step, index) => {
        const done = index < current || project.status === "Completed";
        const active = index === current && project.status !== "Completed";
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

function NextPayment({ milestone }: { milestone: PaymentMilestoneDto | null }) {
  if (!milestone) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm font-semibold">All payments received</p>
        <p className="mt-1 text-sm text-stone-600">Every milestone on your payment schedule has been paid.</p>
      </div>
    );
  }
  const balance = milestone.invoice ? milestone.invoice.balance : Math.max(0, milestone.amount - milestone.paid);
  return (
    <div className="rounded-xl border border-red-200 bg-rose-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Next payment</Eyebrow>
          <p className="mt-1 break-words text-base font-semibold text-stone-950">{milestone.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-red-700">{formatPeso(balance)}</p>
          <p className="mt-1 text-xs text-stone-600">
            Target date {dateOrDash(milestone.targetDate)}{milestone.invoice ? ` · Invoice ${milestone.invoice.number}` : ""}
          </p>
        </div>
        {milestone.invoice ? (
          <Button asChild className="min-h-11 w-full sm:w-auto"><Link href={`/customer/billing?invoice=${encodeURIComponent(milestone.invoice.id)}`}>Pay now</Link></Button>
        ) : null}
      </div>
      {!milestone.invoice && (
        <p className="mt-3 rounded-lg bg-white p-3 text-sm leading-6 text-stone-600">
          {milestone.isDownpayment
            ? "The Billing Clerk is preparing this invoice. You will be notified when it is ready to pay."
            : "Billed when this stage is reached. We will invoice this milestone as construction progresses."}
        </p>
      )}
    </div>
  );
}

export function ConstructionProjectCard({ project }: { project: ConstructionProjectDto }) {
  const progress = project.contractPrice > 0 ? Math.min(100, Math.max(0, (project.paid / project.contractPrice) * 100)) : 0;
  return (
    <div id={`project-${project.id}`} className="scroll-mt-28">
      <BillingPanel className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-red-700"><HardHat className="h-6 w-6" /></div>
            <div className="min-w-0">
              <Eyebrow>{`Project ${project.reference}`}</Eyebrow>
              <h2 className="mt-1 break-words text-xl font-semibold tracking-tight">{project.name}</h2>
            </div>
          </div>
          {project.status === "On hold" && <span className="inline-flex whitespace-nowrap rounded-md bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white">On hold</span>}
        </div>

        <Stepper project={project} />

        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact label="Start date" value={dateOrDash(project.startDate)} />
          <Fact label="Needed by" value={dateOrDash(project.neededBy)} />
          <Fact label="Downpayment" value={project.downpaymentPercent ? `${project.downpaymentPercent}%` : "—"} />
        </dl>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-stone-200 p-4">
            <h3 className="text-sm font-semibold">Contract</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-stone-600">Subtotal</dt><dd className="font-semibold tabular-nums">{formatPeso(project.subtotal)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-stone-600">VAT (12%)</dt><dd className="font-semibold tabular-nums">{formatPeso(project.vat)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-stone-200 pt-2"><dt className="font-semibold">Contract total</dt><dd className="font-semibold tabular-nums text-red-700">{formatPeso(project.contractPrice)}</dd></div>
            </dl>
          </div>
          <div className="rounded-lg border border-stone-200 p-4">
            <h3 className="text-sm font-semibold">Payments</h3>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-rose-200" role="progressbar" aria-label="Paid so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <div className="h-full rounded-full bg-red-700" style={{ width: `${progress}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-stone-500">Paid</dt><dd className="mt-1 font-semibold tabular-nums">{formatPeso(project.paid)}</dd></div>
              <div><dt className="text-xs text-stone-500">Balance</dt><dd className="mt-1 font-semibold tabular-nums">{formatPeso(project.balance)}</dd></div>
            </dl>
          </div>
        </div>

        {project.milestones.length > 0 && (
          <>
            <NextPayment milestone={project.nextMilestone} />
            <div>
              <h3 className="text-base font-semibold tracking-tight">Payment milestones</h3>
              <div className="mt-3"><ScheduleTable rows={project.milestones} /></div>
            </div>
          </>
        )}
      </BillingPanel>
    </div>
  );
}
