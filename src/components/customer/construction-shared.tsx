import { billingDate } from "@/components/billing/billing-primitives";
import { formatPeso } from "@/lib/house-design-data";
import type { PaymentMilestoneStatus } from "@/types/construction";

export const constructionFieldClass = "mt-2 min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-950 outline-none placeholder:text-stone-500 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 disabled:bg-stone-100 sm:text-sm";
export const constructionLabelClass = "block text-sm font-medium text-stone-700";

export const dateOrDash = (value: string | null | undefined) => (value ? billingDate(value) : "—");

export function Eyebrow({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{children}</p>;
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-stone-950">{value}</dd>
    </div>
  );
}

const pillTone: Record<PaymentMilestoneStatus, string> = {
  Upcoming: "bg-stone-100 text-stone-600 ring-stone-200",
  Invoiced: "bg-rose-50 text-red-700 ring-rose-200",
  "Partially paid": "bg-rose-100 text-red-800 ring-rose-200",
  Paid: "bg-stone-900 text-white ring-stone-900",
};

export function MilestonePill({ status }: { status: PaymentMilestoneStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${pillTone[status]}`}>{status}</span>;
}

export type ScheduleRow = {
  label: string;
  description: string;
  percentage: number;
  amount: number;
  targetDate: string;
  isDownpayment: boolean;
  status?: PaymentMilestoneStatus;
};

/** Payment schedule table. Scrolls sideways inside its own wrapper on narrow screens. */
export function ScheduleTable({ rows }: { rows: ScheduleRow[] }) {
  const showStatus = rows.some((row) => row.status);
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <tr>
            <th scope="col" className="px-3 py-2.5">Milestone</th>
            <th scope="col" className="px-3 py-2.5 text-right">%</th>
            <th scope="col" className="px-3 py-2.5 text-right">Amount</th>
            <th scope="col" className="px-3 py-2.5">Target date</th>
            {showStatus && <th scope="col" className="px-3 py-2.5">Status</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {rows.map((row) => (
            <tr key={row.label + row.targetDate} className={row.isDownpayment ? "bg-rose-50/50" : undefined}>
              <td className="max-w-sm px-3 py-3 align-top">
                <p className="font-semibold text-stone-950">{row.label}</p>
                {row.description && <p className="mt-1 text-xs leading-5 text-stone-600">{row.description}</p>}
              </td>
              <td className="px-3 py-3 text-right align-top tabular-nums">{row.percentage}%</td>
              <td className="whitespace-nowrap px-3 py-3 text-right align-top font-semibold tabular-nums">{formatPeso(row.amount)}</td>
              <td className="whitespace-nowrap px-3 py-3 align-top text-stone-600">{dateOrDash(row.targetDate)}</td>
              {showStatus && <td className="px-3 py-3 align-top">{row.status && <MilestonePill status={row.status} />}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
