"use client";

import { Button } from "@/components/ui/button";
import { BillingBadge, billingDate } from "@/components/billing/billing-primitives";
import { formatPeso } from "@/lib/house-design-data";
import type {
  ConstructionProjectDto,
  PaymentMilestoneStatus,
  ProjectStatus,
  ProjectStatusAction,
} from "@/types/construction";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

const projectTone: Record<ProjectStatus, string> = {
  "Awaiting downpayment": "bg-rose-50 text-red-700 ring-rose-200",
  Scheduled: "bg-rose-100 text-red-800 ring-rose-300",
  Active: "bg-red-700 text-white ring-red-700",
  "On hold": "bg-stone-100 text-stone-700 ring-stone-300",
  Completed: "bg-stone-900 text-white ring-stone-900",
  Pending: "bg-stone-100 text-stone-600 ring-stone-200",
};

const milestoneTone: Record<PaymentMilestoneStatus, string> = {
  Upcoming: "bg-stone-100 text-stone-600 ring-stone-200",
  Invoiced: "bg-rose-50 text-red-700 ring-rose-200",
  "Partially paid": "bg-rose-100 text-red-800 ring-rose-300",
  Paid: "bg-stone-900 text-white ring-stone-900",
};

const pillBase = "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset";
const date = (value: string | null | undefined) => (value ? billingDate(value) : "—");
const head = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";

type StatusChange = ProjectStatusAction["status"];

function ProjectCard({
  project,
  onUpdated,
}: {
  project: ConstructionProjectDto;
  onUpdated: (project: ConstructionProjectDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<StatusChange | null>(null);
  const [error, setError] = useState<string | null>(null);

  const progress = project.contractPrice > 0 ? Math.min(100, Math.max(0, (project.paid / project.contractPrice) * 100)) : 0;
  const allPaid =
    project.milestones.length > 0
      ? project.milestones.every((milestone) => milestone.status === "Paid")
      : project.balance <= 0;
  const canActivate = project.status === "Scheduled" || project.status === "On hold";
  const canHold = project.status === "Active" || project.status === "Scheduled";
  const isActive = project.status === "Active";

  async function changeStatus(status: StatusChange) {
    setBusy(status);
    setError(null);
    try {
      const response = await fetch(`/api/construction/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status } satisfies ProjectStatusAction),
      });
      const payload = (await response.json().catch(() => ({}))) as { project?: ConstructionProjectDto; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error ?? "Unable to update this project.");
      onUpdated(payload.project);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Unable to update this project.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="min-w-0 rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{project.reference}</p>
            <h2 className="mt-1 break-words text-lg font-semibold tracking-tight">{project.name}</h2>
            <p className="mt-1 text-sm text-stone-600">{project.customer.name}</p>
          </div>
          <div className="text-right">
            <span className={`${pillBase} ${projectTone[project.status] ?? projectTone.Pending}`}>{project.status}</span>
            <p className="mt-3 text-xl font-semibold tabular-nums tracking-tight">{formatPeso(project.contractPrice)}</p>
            <p className="text-xs text-stone-500">
              {formatPeso(project.subtotal)} + {formatPeso(project.vat)} VAT
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>
              Paid <strong className="tabular-nums">{formatPeso(project.paid)}</strong>
            </span>
            <span className="text-stone-600">
              Balance <strong className="tabular-nums text-stone-950">{formatPeso(project.balance)}</strong>
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Amount paid"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="mt-2 h-2 overflow-hidden rounded-full bg-rose-50 ring-1 ring-inset ring-rose-200"
          >
            <div className="h-full rounded-full bg-rose-400" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Start date</dt>
            <dd className="mt-1">{date(project.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Needed by</dt>
            <dd className="mt-1">{date(project.neededBy)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Next milestone</dt>
            <dd className="mt-1 break-words">
              {project.nextMilestone
                ? `${project.nextMilestone.label} · ${formatPeso(project.nextMilestone.amount)} · ${date(project.nextMilestone.targetDate)}`
                : project.milestones.length > 0
                  ? "All milestones paid"
                  : "—"}
            </dd>
          </div>
        </dl>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canActivate ? (
            <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => void changeStatus("Active")}>
              {busy === "Active" ? "Saving…" : "Mark active"}
            </Button>
          ) : null}
          {canHold ? (
            <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void changeStatus("On hold")}>
              {busy === "On hold" ? "Saving…" : "Put on hold"}
            </Button>
          ) : null}
          {isActive ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busy) || !allPaid}
              onClick={() => void changeStatus("Completed")}
            >
              {busy === "Completed" ? "Saving…" : "Mark completed"}
            </Button>
          ) : null}
          {isActive && !allPaid ? (
            <p className="text-xs text-stone-500">Completion unlocks once every milestone is fully paid.</p>
          ) : null}
          {project.milestones.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              Payment schedule
              <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </Button>
          ) : null}
        </div>
      </div>

      {expanded && project.milestones.length > 0 ? (
        <div className="overflow-x-auto border-t border-stone-200">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <caption className="sr-only">Payment schedule for {project.name}</caption>
            <thead className="bg-stone-50">
              <tr>
                <th className={head}>Milestone</th>
                <th className={`${head} text-right`}>%</th>
                <th className={`${head} text-right`}>Amount</th>
                <th className={head}>Target date</th>
                <th className={head}>Invoice</th>
                <th className={head}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {project.milestones.map((milestone) => (
                <tr key={milestone.id}>
                  <td className="px-3 py-3 font-medium">{milestone.label}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{milestone.percentage}%</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">{formatPeso(milestone.amount)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-stone-600">{date(milestone.targetDate)}</td>
                  <td className="px-3 py-3">
                    {milestone.invoice ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{milestone.invoice.number}</span>
                        <BillingBadge status={milestone.invoice.status} />
                      </div>
                    ) : (
                      <span className="text-stone-400">Not invoiced</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`${pillBase} ${milestoneTone[milestone.status]}`}>{milestone.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

export function AdminProjectSlides() {
  const [projects, setProjects] = useState<ConstructionProjectDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/construction/projects", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          projects?: ConstructionProjectDto[];
          error?: string;
        };
        if (!response.ok || !payload.projects) {
          throw new Error(payload.error ?? "Unable to load projects.");
        }
        return payload.projects;
      })
      .then((items) => {
        if (active) setProjects(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load projects.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-w-0 space-y-5">
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Project Records</h1>
        <p className="mt-1 text-sm text-stone-600">
          Contract values, payment progress, and billing milestones for each construction project.
        </p>
        {error ? (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {isLoading ? <p className="mt-5 text-sm text-stone-500">Loading project records…</p> : null}
        {!isLoading && !error && projects.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
            No project records yet. Projects appear here once a customer accepts a cost estimate.
          </p>
        ) : null}
      </section>

      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onUpdated={(updated) =>
            setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)))
          }
        />
      ))}
    </div>
  );
}
