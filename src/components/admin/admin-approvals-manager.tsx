"use client";

import { AdminDesignWorkflow } from "@/components/admin/admin-design-workflow";
import { Button } from "@/components/ui/button";
import { useModalBehavior } from "@/lib/use-modal-behavior";
import { clickableRowClass, clickableRowProps } from "@/components/ui/clickable-row";
import { formatPeso } from "@/lib/house-design-data";
import {
  approvalRecordTypes,
  type ApprovalDto,
  type ApprovalRecordType,
  type ApprovalStatus,
  type ApprovalSummary,
} from "@/types/approvals";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  LoaderCircle,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type ApprovalPayload = {
  approvals: ApprovalDto[];
  summary: ApprovalSummary;
};

/** Where an approved design request stands in the review and blueprint workflow. */
const designStageLabel: Record<string, string> = {
  Approved: "Design in progress",
  "In customer review": "With customer for review",
  "Changes requested": "Customer requested changes",
  "Design approved": "Design approved · Blueprint stage",
  Completed: "Design delivered (legacy)",
};

const emptySummary: ApprovalSummary = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

const fieldClass =
  "h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

const statusClass: Record<ApprovalStatus, string> = {
  Pending: "bg-amber-50 text-amber-800",
  Approved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-red-50 text-red-700",
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & {
    error?: string;
    issues?: { message?: string }[];
  };
  if (!response.ok) {
    throw new Error(
      payload.issues?.[0]?.message ??
        payload.error ??
        "The approval request could not be completed.",
    );
  }
  return payload;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function UrgencyBadge({ neededBy }: { neededBy: string }) {
  const days = Math.round(
    (Date.parse(`${neededBy}T00:00:00.000Z`) -
      Date.parse(`${manilaToday()}T00:00:00.000Z`)) /
      86_400_000,
  );
  const label =
    days < 0
      ? "Needed By date passed"
      : days === 0
        ? "Needed today"
        : `Needed in ${days} day${days === 1 ? "" : "s"}`;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        days <= 14 ? "bg-rose-50 text-red-800" : "bg-stone-100 text-stone-600"
      }`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[status]}`}
    >
      {status}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof ShieldCheck;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white p-5 text-left shadow-sm transition hover:border-red-200 hover:bg-red-50/40 ${
        active ? "border-red-300 ring-2 ring-red-600/10" : "border-stone-200"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}

function ApprovalReviewDialog({
  approval,
  isSaving,
  error,
  onClose,
  onApprove,
  onNotice,
}: {
  approval: ApprovalDto;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onApprove: (note: string) => void;
  onNotice: (message: string) => void;
}) {
  const [note, setNote] = useState(approval.reviewNote ?? "");
  useModalBehavior(true, () => {
    if (!isSaving) onClose();
  });
  const inspirationImages = approval.inspirationImages ?? [];
  const deliveredImages = approval.completedDesignImages ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-stone-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-dialog-title"
    >
      <button
        type="button"
        className="fixed inset-0 cursor-default"
        aria-label="Close approval review"
        onClick={onClose}
      />
      {/* Auto margins center a short popup and let a tall one start at the top, so it can scroll fully. */}
      <section className="relative m-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-red-700">
                {approval.recordType}
              </span>
              <StatusBadge status={approval.status} />
            </div>
            <h2 id="approval-dialog-title" className="mt-2 text-xl font-semibold tracking-tight">
              {approval.subject}
            </h2>
            <p className="mt-1 text-sm text-stone-500">{approval.reference}</p>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-50"
            aria-label="Close review"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {!approval.sourceAvailable ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The connected source record is unavailable. Restore it before making a decision.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-stone-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <UserRound className="h-4 w-4" /> Client
              </p>
              <p className="mt-2 font-semibold">{approval.customer.name}</p>
              <p className="mt-1 text-sm text-stone-500">{approval.customer.email}</p>
            </div>
            <div className="rounded-lg bg-stone-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <CalendarDays className="h-4 w-4" /> Submitted
              </p>
              <p className="mt-2 text-sm font-semibold">{formatDate(approval.createdAt)}</p>
              {approval.sourceStatus ? (
                <p className="mt-1 text-sm text-stone-500">
                  Source status: {approval.sourceStatus}
                </p>
              ) : null}
            </div>
          </div>

          {approval.recordType === "Design request" ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0 rounded-lg bg-stone-50 p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Preferred Date
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {approval.preferredDate ? formatDay(approval.preferredDate) : "Not specified"}
                </p>
              </div>
              <div className="min-w-0 rounded-lg bg-stone-50 p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Needed By
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {approval.neededBy ? formatDay(approval.neededBy) : "Not specified"}
                </p>
                {approval.neededBy ? (
                  <div className="mt-2">
                    <UrgencyBadge neededBy={approval.neededBy} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {approval.selectedDesign ? "Client Notes" : "Request Details"}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">
              {approval.description}
            </p>
            {approval.amount !== undefined ? (
              <p className="mt-3 text-2xl font-semibold tracking-tight text-red-700">
                {formatPeso(approval.amount)}
              </p>
            ) : null}
          </div>

          {approval.selectedDesign ? (
            <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Selected Published Design</p>
              <h3 className="mt-2 font-semibold">{approval.selectedDesign.name}</h3>
              <p className="mt-1 text-sm text-stone-600">{approval.selectedDesign.floorArea} sqm · {approval.selectedDesign.rooms}</p>
              {approval.selectedDesignImages?.[0] ? (
                <div className="relative mt-3 aspect-[16/9] overflow-hidden rounded-lg bg-stone-100">
                  <Image src={approval.selectedDesignImages[0]} alt={approval.selectedDesign.name} fill unoptimized className="object-contain" />
                </div>
              ) : null}
            </section>
          ) : null}

          {approval.recordType === "Design request" ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {approval.selectedDesign ? "Additional Client References" : "Client Inspiration"}
              </p>
              {inspirationImages.length > 0 ? (
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {inspirationImages.map((image, index) => (
                    <div
                      key={`inspiration-${index}`}
                      className="relative aspect-[4/3] overflow-hidden rounded-lg border border-stone-200 bg-stone-100"
                    >
                      <Image
                        src={image}
                        alt={`Client house inspiration ${index + 1}`}
                        fill
                        unoptimized
                        className="object-contain"
                      />
                      <span className="absolute bottom-2 left-2 rounded bg-stone-950/70 px-2 py-1 text-[11px] font-semibold text-white">
                        Reference {index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
                  {approval.selectedDesign ? "The customer selected an existing design and did not add extra reference images." : "This legacy request does not include an inspiration image."}
                </p>
              )}
            </div>
          ) : null}

          {approval.status === "Pending" ? (
            <div className="border-t border-stone-200 pt-5">
              <label className="text-sm font-semibold text-stone-700">
                Review Note
                <span className="ml-1 font-normal text-stone-500">
                  (optional)
                </span>
                <textarea
                  rows={4}
                  maxLength={1_000}
                  value={note}
                  disabled={isSaving || !approval.sourceAvailable}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Enter review note"
                  className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15 disabled:bg-stone-100"
                />
              </label>
              <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSaving || !approval.sourceAvailable}
                  onClick={() => onApprove(note)}
                >
                  {isSaving ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {isSaving ? "Saving decision…" : "Approve"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-stone-200 p-4">
                <p className="text-sm font-semibold">
                  Reviewed by {approval.reviewedByName ?? "an administrator"}
                </p>
                {approval.reviewedAt ? (
                  <p className="mt-1 text-sm text-stone-500">
                    {formatDate(approval.reviewedAt)}
                  </p>
                ) : null}
                {approval.reviewNote ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                    {approval.reviewNote}
                  </p>
                ) : null}
              </div>

              {approval.recordType === "Design request" &&
              approval.status === "Approved" ? (
                approval.sourceStatus !== "Completed" ? (
                  <AdminDesignWorkflow designRequestId={approval.recordId} onNotice={onNotice} />
                ) : deliveredImages.length > 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" /> {deliveredImages.length} completed design image{deliveredImages.length === 1 ? "" : "s"} sent to client
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {deliveredImages.map((image, index) => (
                        <div
                          key={`delivered-${index}`}
                          className="relative aspect-[4/3] overflow-hidden rounded-lg bg-white"
                        >
                          <Image
                            src={image}
                            alt={`Completed design delivered to client ${index + 1}`}
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        </div>
                      ))}
                    </div>
                    {approval.completedAt ? (
                      <p className="mt-3 text-xs text-emerald-700">
                        Delivered {formatDate(approval.completedAt)}
                      </p>
                    ) : null}
                  </div>
                ) : null
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function AdminApprovalsManager() {
  const [approvals, setApprovals] = useState<ApprovalDto[]>([]);
  const [summary, setSummary] = useState<ApprovalSummary>(emptySummary);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ApprovalRecordType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("Pending");
  const [page, setPage] = useState(1);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadApprovals = useCallback(async (refresh = false) => {
    if (!refresh) setIsLoading(true);

    try {
      const response = await fetch("/api/approvals", { cache: "no-store" });
      const payload = await readJson<ApprovalPayload>(response);
      setApprovals(payload.approvals);
      setSummary(payload.summary);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load approval records.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/approvals", { cache: "no-store" })
      .then((response) => readJson<ApprovalPayload>(response))
      .then((payload) => {
        if (!active) return;
        setApprovals(payload.approvals);
        setSummary(payload.summary);
        setError(null);
        // The dashboard links here with ?review=<reference> to open that record straight away.
        const params = new URLSearchParams(window.location.search);
        const requested = payload.approvals.find((approval) => approval.reference === params.get("review"));
        if (requested) setSelectedApproval(requested);
        if (params.has("review")) {
          params.delete("review");
          const query = params.toString();
          window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load approval records.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredApprovals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return approvals.filter((approval) => {
      const matchesSearch =
        !query ||
        approval.reference.toLowerCase().includes(query) ||
        approval.subject.toLowerCase().includes(query) ||
        approval.customer.name.toLowerCase().includes(query) ||
        approval.customer.email.toLowerCase().includes(query);
      const matchesType =
        typeFilter === "all" || approval.recordType === typeFilter;
      const matchesStatus =
        statusFilter === "all" || approval.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [approvals, search, statusFilter, typeFilter]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredApprovals.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleApprovals = filteredApprovals.slice(
    (visiblePage - 1) * pageSize,
    visiblePage * pageSize,
  );

  const openReview = (approval: ApprovalDto) => {
    setDecisionError(null);
    setSuccessMessage(null);
    setSelectedApproval(approval);
  };

  const submitApproval = async (note: string) => {
    if (!selectedApproval) return;

    setIsSaving(true);
    setDecisionError(null);
    try {
      const response = await fetch(`/api/approvals/${selectedApproval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "Approved", note }),
      });
      await readJson<{ approval: { status: ApprovalStatus } }>(response);
      setSuccessMessage(
        selectedApproval.recordType === "Design request"
          ? `${selectedApproval.reference} is feasible and approved. The client was notified; upload the design and floor plan from the Approved queue when they are ready.`
          : `${selectedApproval.reference} was approved. The client has been notified.`,
      );
      setSelectedApproval(null);
      await loadApprovals(true);
    } catch (saveError) {
      setDecisionError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the approval decision.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const setSummaryFilter = (status: ApprovalStatus | "all") => {
    setStatusFilter(status);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="All Approvals"
          value={summary.total}
          icon={FileCheck2}
          active={statusFilter === "all"}
          onClick={() => setSummaryFilter("all")}
        />
        <SummaryCard
          label="Pending Review"
          value={summary.pending}
          icon={Clock}
          active={statusFilter === "Pending"}
          onClick={() => setSummaryFilter("Pending")}
        />
        <SummaryCard
          label="Approved"
          value={summary.approved}
          icon={CheckCircle2}
          active={statusFilter === "Approved"}
          onClick={() => setSummaryFilter("Approved")}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-stone-200 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Approval Queue</h1>
            <p className="mt-1 text-sm text-stone-600">
              Review connected design, estimate, billing, and document records.
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-b border-stone-200 bg-stone-50 p-4 md:grid-cols-[minmax(0,1fr)_220px_180px]">
          <label className="relative block">
            <span className="sr-only">Search approvals</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search reference or client"
              className={`${fieldClass} w-full pl-9`}
            />
          </label>
          <label>
            <span className="sr-only">Filter by record type</span>
            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value as ApprovalRecordType | "all");
                setPage(1);
              }}
              className={`${fieldClass} w-full`}
            >
              <option value="all">All Record Types</option>
              {approvalRecordTypes.map((recordType) => (
                <option key={recordType} value={recordType}>
                  {recordType}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as ApprovalStatus | "all");
                setPage(1);
              }}
              className={`${fieldClass} w-full`}
            >
              <option value="all">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-sm text-stone-500">
            <LoaderCircle className="h-5 w-5 animate-spin text-red-700" />
            Loading approvals from MongoDB…
          </div>
        ) : visibleApprovals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-white text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="border-b border-stone-200 px-5 py-3">Reference</th>
                  <th className="border-b border-stone-200 px-5 py-3">Client</th>
                  <th className="border-b border-stone-200 px-5 py-3">Record</th>
                  <th className="border-b border-stone-200 px-5 py-3">Submitted</th>
                  <th className="border-b border-stone-200 px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleApprovals.map((approval) => (
                  <tr
                    key={approval.id}
                    {...clickableRowProps(
                      `${approval.status === "Pending" ? "Review" : "View"} ${approval.reference}`,
                      () => openReview(approval),
                    )}
                    className={clickableRowClass}
                  >
                    <td className="border-b border-stone-100 px-5 py-4 align-top">
                      <p className="font-semibold">{approval.reference}</p>
                      <p className="mt-1 text-xs text-stone-500">{approval.recordType}</p>
                    </td>
                    <td className="border-b border-stone-100 px-5 py-4 align-top">
                      <p className="font-medium">{approval.customer.name}</p>
                      <p className="mt-1 text-xs text-stone-500">{approval.customer.email}</p>
                    </td>
                    <td className="max-w-xs border-b border-stone-100 px-5 py-4 align-top">
                      <p className="font-medium">{approval.subject}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                        {approval.description}
                      </p>
                      {approval.recordType === "Design request" ? (
                        <div className="mt-2 space-y-1 text-xs text-stone-500">
                          <p>
                            Preferred Date:{" "}
                            <span className="font-medium text-stone-700">
                              {approval.preferredDate ? formatDay(approval.preferredDate) : "Not specified"}
                            </span>
                          </p>
                          <p>
                            Needed By:{" "}
                            <span className="font-medium text-stone-700">
                              {approval.neededBy ? formatDay(approval.neededBy) : "Not specified"}
                            </span>
                          </p>
                          {approval.neededBy ? <UrgencyBadge neededBy={approval.neededBy} /> : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap border-b border-stone-100 px-5 py-4 align-top text-stone-600">
                      {formatDate(approval.createdAt)}
                    </td>
                    <td className="border-b border-stone-100 px-5 py-4 align-top">
                      <StatusBadge status={approval.status} />
                      {approval.recordType === "Design request" &&
                      approval.status === "Approved" ? (
                        <p className="mt-2 text-xs font-medium text-stone-500">
                          {designStageLabel[approval.sourceStatus ?? ""] ?? "Design in progress"}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-stone-300" />
            <p className="mt-4 font-semibold">No Matching Approvals</p>
            <p className="mt-1 text-sm text-stone-500">
              {statusFilter === "Pending" && !search && typeFilter === "all"
                ? "The review queue is clear. New connected requests will appear here automatically."
                : "Try changing the search or filters."}
            </p>
          </div>
        )}

        {!isLoading && filteredApprovals.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-stone-500">
              Showing {(visiblePage - 1) * pageSize + 1}–{Math.min(visiblePage * pageSize, filteredApprovals.length)} of {filteredApprovals.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={visiblePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="px-2 text-sm text-stone-500">
                Page {visiblePage} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={visiblePage >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedApproval ? (
        <ApprovalReviewDialog
          key={selectedApproval.id}
          approval={selectedApproval}
          isSaving={isSaving}
          error={decisionError}
          onClose={() => {
            if (!isSaving) setSelectedApproval(null);
          }}
          onApprove={(note) => void submitApproval(note)}
          onNotice={(message) => {
            setSuccessMessage(`${selectedApproval.reference}: ${message}`);
            void loadApprovals(true);
          }}
        />
      ) : null}
    </div>
  );
}
