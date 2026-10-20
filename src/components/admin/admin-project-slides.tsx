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
import type { HouseType } from "@/lib/house-design-data";
import { Building2, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

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

const fieldClass =
  "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600";

/** A starting name such as "Munarriz Prairie Home"; the Admin can change it. */
function suggestedDesignName(project: ConstructionProjectDto) {
  const surname = project.customer.name.trim().split(/\s+/).pop() ?? "";
  return [surname, project.houseType, "Home"].filter(Boolean).join(" ");
}

/** Marking a project completed also names the house design saved from it and files it under a house type. */
function CompleteProjectDialog({
  project,
  onClose,
  onCompleted,
}: {
  project: ConstructionProjectDto;
  onClose: () => void;
  onCompleted: (project: ConstructionProjectDto) => void;
}) {
  const [name, setName] = useState(() => suggestedDesignName(project));
  const [houseType, setHouseType] = useState(project.houseType ?? "");
  const [houseTypes, setHouseTypes] = useState<HouseType[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    nameRef.current?.select();
    let active = true;
    fetch("/api/catalog/house-designs", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ houseTypes?: HouseType[] }>)
      .then((catalog) => {
        if (active) setHouseTypes(catalog.houseTypes ?? []);
      })
      .catch(() => {
        if (active) setError("House types could not be loaded. Close this and try again.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSaving, onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    const nextNameError = trimmed.length < 2
      ? "Enter a name for the house design."
      : trimmed.length > 120 ? "Keep the design name within 120 characters." : null;
    const nextTypeError = houseType ? null : "Choose the house type it is filed under.";
    setNameError(nextNameError);
    setTypeError(nextTypeError);
    if (nextNameError || nextTypeError) {
      (nextNameError ? nameRef : typeRef).current?.focus();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/construction/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status", status: "Completed", designName: trimmed, houseType,
        } satisfies ProjectStatusAction),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        project?: ConstructionProjectDto; error?: string; issues?: { message?: string }[];
      };
      if (!response.ok || !payload.project) {
        throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to complete this project.");
      }
      onCompleted(payload.project);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to complete this project.");
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-950/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`complete-${project.id}-title`}
        aria-describedby={`complete-${project.id}-description`}
        onSubmit={(event) => void submit(event)}
        noValidate
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6"
      >
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          Complete Project · {project.reference}
        </p>
        <h2 id={`complete-${project.id}-title`} className="mt-1 text-lg font-semibold tracking-tight">
          Save It as a House Design
        </h2>
        <p id={`complete-${project.id}-description`} className="mt-1 text-sm leading-6 text-stone-600">
          The finished house is saved to House Design with its cost estimate and design images.
        </p>

        <label htmlFor={`complete-${project.id}-name`} className="mt-5 block text-sm font-semibold text-stone-950">
          Design Name <span className="text-red-700" aria-hidden="true">*</span>
        </label>
        <input
          ref={nameRef}
          id={`complete-${project.id}-name`}
          value={name}
          maxLength={120}
          onChange={(event) => { setName(event.target.value); setNameError(null); setError(null); }}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `complete-${project.id}-name-error` : undefined}
          className={fieldClass}
        />
        {nameError ? <p id={`complete-${project.id}-name-error`} className="mt-1.5 text-sm text-red-700">{nameError}</p> : null}

        <label htmlFor={`complete-${project.id}-type`} className="mt-4 block text-sm font-semibold text-stone-950">
          House Type <span className="text-red-700" aria-hidden="true">*</span>
        </label>
        <select
          ref={typeRef}
          id={`complete-${project.id}-type`}
          value={houseType}
          onChange={(event) => { setHouseType(event.target.value); setTypeError(null); }}
          aria-invalid={typeError ? true : undefined}
          aria-describedby={`complete-${project.id}-type-hint${typeError ? ` complete-${project.id}-type-error` : ""}`}
          className={fieldClass}
        >
          <option value="">Select a house type</option>
          {houseType && !houseTypes.some((type) => type.heading === houseType) ? <option value={houseType}>{houseType}</option> : null}
          {houseTypes.map((type) => <option key={type.heading} value={type.heading}>{type.heading}</option>)}
        </select>
        <p id={`complete-${project.id}-type-hint`} className="mt-1.5 text-xs text-stone-500">
          {project.houseType ? "Chosen by the client on the design request." : "The client did not choose one on the design request."}
        </p>
        {typeError ? <p id={`complete-${project.id}-type-error`} className="mt-1 text-sm text-red-700">{typeError}</p> : null}

        <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
          Saved as a draft. Customers see it only after you publish it in House Design.
        </p>

        {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Complete and Save"}</Button>
        </div>
      </form>
    </div>
  );
}

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
  const [isCompleting, setIsCompleting] = useState(false);

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
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Start Date</dt>
            <dd className="mt-1">{date(project.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Needed by</dt>
            <dd className="mt-1">{date(project.neededBy)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Next Milestone</dt>
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
              {busy === "Active" ? "Saving…" : "Mark Active"}
            </Button>
          ) : null}
          {canHold ? (
            <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void changeStatus("On hold")}>
              {busy === "On hold" ? "Saving…" : "Put on Hold"}
            </Button>
          ) : null}
          {isActive ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busy) || !allPaid}
              onClick={() => setIsCompleting(true)}
            >
              Mark Completed
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
              Payment Schedule
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
                <th className={head}>Target Date</th>
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
                      <span className="text-stone-400">Not Invoiced</span>
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
      {isCompleting ? (
        <CompleteProjectDialog
          project={project}
          onClose={() => setIsCompleting(false)}
          onCompleted={(updated) => {
            setIsCompleting(false);
            onUpdated(updated);
          }}
        />
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
