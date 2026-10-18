"use client";

import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { CollectionsSummary } from "@/components/billing/collections-summary";
import { CalendarRange, FileWarning, HandCoins, LayoutDashboard, type LucideIcon } from "lucide-react";
import { useState } from "react";

type Tab = "overview" | "monthly" | "collections" | "outstanding";

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "monthly", label: "By Month", icon: CalendarRange },
  { id: "collections", label: "Verified Collections", icon: HandCoins },
  { id: "outstanding", label: "Outstanding Invoices", icon: FileWarning },
];

/** The Billing Clerk's reports, one at a time, with a section list like Maintenance. */
export function BillingReports() {
  const [tab, setTab] = useState<Tab>("overview");
  const isSummary = tab === "overview" || tab === "monthly";

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Report sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                setTab(item.id);
                // On phones the sections scroll sideways; keep the chosen one in view.
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                active ? "bg-rose-50 text-red-800 ring-1 ring-rose-200" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Both stay mounted so each tab keeps its filters and checked rows when switching. */}
      <div className="min-w-0">
        <div hidden={!isSummary}>
          <CollectionsSummary view={tab === "monthly" ? "monthly" : "overview"} />
        </div>
        <div hidden={isSummary} className="space-y-6">
          <BillingWorkspace section="Reports" reportView={tab === "outstanding" ? "outstanding" : "collections"} />
        </div>
      </div>
    </div>
  );
}
