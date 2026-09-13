"use client";

import { Button } from "@/components/ui/button";
import { roleLabels, type UserRole } from "@/types/domain";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FilterX,
  ListFilter,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

type AuditLogDto = {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole | "unknown";
  action: string;
  entityType: string;
  entityId?: string;
  details: Record<string, string | number | boolean | null>;
  createdAt: string;
};

type AuditLogPayload = {
  logs: AuditLogDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
  summary: {
    total: number;
    today: number;
    actors: number;
    eventTypes: number;
  };
  filters: {
    actions: string[];
    entityTypes: string[];
  };
};

const emptyPayload: AuditLogPayload = {
  logs: [],
  pagination: { page: 1, pageSize: 15, total: 0, pageCount: 1 },
  summary: { total: 0, today: 0, actors: 0, eventTypes: 0 },
  filters: { actions: [], entityTypes: [] },
};

const fieldClass =
  "h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

const roleBadgeClass: Record<UserRole | "unknown", string> = {
  admin: "bg-red-50 text-red-700",
  "billing-clerk": "bg-amber-50 text-amber-800",
  customer: "bg-blue-50 text-blue-700",
  unknown: "bg-stone-100 text-stone-600",
};

const actionLabels: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.registered": "Registered an account",
  "user.created": "Created a user",
  "user.updated": "Updated a user",
  "house-design.created": "Created a house design",
  "house-design.updated": "Updated a house design",
  "schedule.created": "Created a schedule",
  "schedule.status-updated": "Updated a schedule status",
  "design-request.created": "Submitted a design request",
  "message.sent": "Sent a message",
};

function humanize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\./g, " · ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function actionLabel(action: string) {
  return actionLabels[action] ?? humanize(action);
}

function detailLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function detailValue(value: string | number | boolean | null) {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "The audit logs could not be loaded.");
  }
  return payload;
}

export function AdminAuditLogViewer() {
  const [payload, setPayload] = useState<AuditLogPayload>(emptyPayload);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const parameters = new URLSearchParams({ page: String(page) });
      if (search.trim()) parameters.set("search", search.trim());
      if (action) parameters.set("action", action);
      if (entityType) parameters.set("entityType", entityType);
      if (from) parameters.set("from", from);
      if (to) parameters.set("to", to);

      try {
        const response = await fetch(`/api/audit-logs?${parameters}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const nextPayload = await readJson<AuditLogPayload>(response);
        setPayload(nextPayload);
        setError(null);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the audit logs.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }, search ? 300 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [action, entityType, from, page, refreshKey, search, to]);

  const hasFilters = Boolean(search || action || entityType || from || to);
  const firstRecord =
    payload.pagination.total === 0
      ? 0
      : (payload.pagination.page - 1) * payload.pagination.pageSize + 1;
  const lastRecord = Math.min(
    payload.pagination.page * payload.pagination.pageSize,
    payload.pagination.total,
  );

  const resetFilters = () => {
    setSearch("");
    setAction("");
    setEntityType("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const refresh = () => {
    setIsRefreshing(true);
    setRefreshKey((value) => value + 1);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total events", value: payload.summary.total, icon: Activity },
          { label: "Events today", value: payload.summary.today, icon: CalendarDays },
          { label: "Recorded actors", value: payload.summary.actors, icon: Users },
          { label: "Event types", value: payload.summary.eventTypes, icon: ShieldCheck },
        ].map((item) => (
          <section
            key={item.label}
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-stone-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {item.value.toLocaleString("en-PH")}
                </p>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-700">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </section>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ListFilter className="h-5 w-5 text-red-700" aria-hidden="true" />
                <h2 className="text-lg font-semibold tracking-tight">System activity</h2>
              </div>
              <p className="mt-1 text-sm text-stone-600">
                Review who performed an action, what changed, and when it happened.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(170px,1fr)_minmax(160px,1fr)_150px_150px_auto]">
            <label className="relative">
              <span className="sr-only">Search audit logs</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-400" />
              <input
                type="search"
                value={search}
                maxLength={100}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search actor or activity"
                className={`${fieldClass} w-full pl-9`}
              />
            </label>

            <label>
              <span className="sr-only">Filter by action</span>
              <select
                value={action}
                onChange={(event) => {
                  setAction(event.target.value);
                  setPage(1);
                }}
                className={`${fieldClass} w-full`}
              >
                <option value="">All actions</option>
                {payload.filters.actions.map((option) => (
                  <option key={option} value={option}>
                    {actionLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="sr-only">Filter by target</span>
              <select
                value={entityType}
                onChange={(event) => {
                  setEntityType(event.target.value);
                  setPage(1);
                }}
                className={`${fieldClass} w-full`}
              >
                <option value="">All targets</option>
                {payload.filters.entityTypes.map((option) => (
                  <option key={option} value={option}>
                    {humanize(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-stone-500">
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                className={`${fieldClass} mt-1 w-full`}
              />
            </label>

            <label className="text-xs font-medium text-stone-500">
              To
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                className={`${fieldClass} mt-1 w-full`}
              />
            </label>

            <Button
              type="button"
              variant="outline"
              onClick={resetFilters}
              disabled={!hasFilters}
              className="self-end"
            >
              <FilterX className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-sm text-stone-500">
            Loading audit records from MongoDB…
          </div>
        ) : payload.logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="border-b border-stone-200 px-5 py-3">Actor</th>
                  <th className="border-b border-stone-200 px-5 py-3">Activity</th>
                  <th className="border-b border-stone-200 px-5 py-3">Target</th>
                  <th className="border-b border-stone-200 px-5 py-3">Details</th>
                  <th className="border-b border-stone-200 px-5 py-3">Date and time</th>
                </tr>
              </thead>
              <tbody>
                {payload.logs.map((log) => {
                  const details = Object.entries(log.details);
                  return (
                    <tr key={log.id} className="align-top hover:bg-stone-50">
                      <td className="border-b border-stone-100 px-5 py-4">
                        <p className="font-semibold text-stone-950">{log.actorName}</p>
                        <span
                          className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass[log.actorRole]}`}
                        >
                          {log.actorRole === "unknown"
                            ? "Former/unknown user"
                            : roleLabels[log.actorRole]}
                        </span>
                      </td>
                      <td className="border-b border-stone-100 px-5 py-4">
                        <p className="font-medium text-stone-800">
                          {actionLabel(log.action)}
                        </p>
                        <code className="mt-1 block text-xs text-stone-500">
                          {log.action}
                        </code>
                      </td>
                      <td className="border-b border-stone-100 px-5 py-4">
                        <p className="font-medium text-stone-800">
                          {humanize(log.entityType)}
                        </p>
                        {log.entityId ? (
                          <p className="mt-1 font-mono text-xs text-stone-500" title={log.entityId}>
                            {log.entityId.slice(0, 8)}…{log.entityId.slice(-6)}
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-[340px] border-b border-stone-100 px-5 py-4">
                        {details.length > 0 ? (
                          <dl className="space-y-1.5">
                            {details.map(([key, value]) => (
                              <div key={key} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                                <dt className="text-xs font-medium text-stone-500">
                                  {detailLabel(key)}
                                </dt>
                                <dd className="break-words text-xs text-stone-700">
                                  {detailValue(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-stone-100 px-5 py-4 text-stone-600">
                        <time dateTime={log.createdAt}>{formatTimestamp(log.createdAt)}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <ShieldCheck className="mx-auto h-9 w-9 text-stone-300" aria-hidden="true" />
            <p className="mt-3 font-semibold">No audit events found</p>
            <p className="mt-1 text-sm text-stone-500">
              {hasFilters
                ? "Try clearing or changing the current filters."
                : "Recorded system actions will appear here."}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-stone-500">
            Showing {firstRecord.toLocaleString("en-PH")}–{lastRecord.toLocaleString("en-PH")} of{" "}
            {payload.pagination.total.toLocaleString("en-PH")} events
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="grid min-w-24 place-items-center text-sm text-stone-600">
              Page {payload.pagination.page} of {payload.pagination.pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page >= payload.pagination.pageCount || isLoading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
