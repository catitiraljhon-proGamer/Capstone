import { formatPeso } from "@/lib/house-design-data";
import { paymentDueClass } from "@/lib/schedule-display";
import type { PaymentDueDto } from "@/types/billing";
import { Banknote, Users } from "lucide-react";
import type { ReactNode } from "react";

/** One customer payment date on a calendar's selected-day panel. Customers see their own, so the name is hidden. */
export function PaymentDueCard({ due, showClient = true, action }: { due: PaymentDueDto; showClient?: boolean; action?: ReactNode }) {
  return (
    <article className={`rounded-xl border p-4 ${paymentDueClass[due.status]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">{due.kind}</p>
          <h3 className="mt-1 break-words font-semibold text-stone-950">{due.label}</h3>
        </div>
        <span className="rounded bg-white/70 px-2 py-1 text-xs font-semibold">{due.status}</span>
      </div>
      <div className="mt-3 space-y-1.5 text-sm text-stone-700">
        {showClient ? <p className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0" />{due.clientName}</p> : null}
        {due.projectName ? <p className={showClient ? "pl-6 text-xs" : "text-xs"}>{due.projectName}</p> : null}
        <p className="flex items-start gap-2">
          <Banknote className="mt-0.5 h-4 w-4 shrink-0" />
          {formatPeso(due.amount)}{due.status !== "Upcoming" && due.balance !== due.amount ? ` · Balance ${formatPeso(due.balance)}` : ""}
        </p>
        <p className="pl-6 text-xs">{due.invoiceNumber ? `Invoice ${due.invoiceNumber}` : "In the payment schedule · Not invoiced yet"}</p>
      </div>
      {action ? <div className="mt-3">{action}</div> : null}
    </article>
  );
}
