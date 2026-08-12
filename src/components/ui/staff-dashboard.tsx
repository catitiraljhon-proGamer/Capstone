import { BrandLogo } from "@/components/ui/brand-logo";
import {
  Bell,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Gauge,
  LogOut,
  ReceiptText,
  ShieldCheck,
  User,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

type IconType = ComponentType<{ className?: string }>;

type StaffDashboardProps = {
  role: "Billing Clerk" | "Admin";
  name: string;
  title: string;
  description: string;
  navItems: { label: string; icon: IconType; href: string; active?: boolean }[];
  metrics: { label: string; value: string; note: string; icon: IconType }[];
  primaryPanel: ReactNode;
  queueTitle: string;
  queueItems: { title: string; meta: string; amount?: string; status: string }[];
  activityItems: { title: string; body: string; date: string }[];
};

const clerkNav = [
  { label: "Dashboard", icon: Gauge, href: "/billing-clerk", active: true },
  { label: "Messages", icon: Bell, href: "/billing-clerk/messages" },
  { label: "Progress Billings", icon: ReceiptText, href: "#" },
  { label: "Payments", icon: WalletCards, href: "#" },
  { label: "Invoices", icon: FileText, href: "#" },
  { label: "Customer Accounts", icon: Users, href: "#" },
  { label: "Reports", icon: ClipboardCheck, href: "#" },
];

const adminNav = [
  { label: "Dashboard", icon: Gauge, href: "/admin", active: true },
  { label: "Messages", icon: Bell, href: "/admin/messages" },
  { label: "Projects", icon: FolderKanban, href: "#" },
  { label: "Approvals", icon: ShieldCheck, href: "#" },
  { label: "Cost Estimates", icon: Calculator, href: "#" },
  { label: "Billing Control", icon: ReceiptText, href: "#" },
  { label: "Users & Roles", icon: Users, href: "#" },
  { label: "Reports", icon: ClipboardCheck, href: "#" },
];

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function StaffDashboard({
  role,
  name,
  title,
  description,
  navItems,
  metrics,
  primaryPanel,
  queueTitle,
  queueItems,
  activityItems,
}: StaffDashboardProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-24 items-center border-b border-stone-200 px-5">
          <BrandLogo compact />
        </div>
        <nav className="flex-1 space-y-1 px-4 py-5">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={[
                "flex items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium transition",
                item.active
                  ? "bg-red-700 text-white shadow-sm"
                  : "text-stone-600 hover:bg-red-50 hover:text-red-800",
              ].join(" ")}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 pb-6">
          <Link
            href="/login"
            className="flex items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-950"
          >
            <LogOut className="h-5 w-5" />
            Log out
          </Link>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-xl font-semibold tracking-tight">{title}</p>
              <p className="mt-1 text-sm text-stone-600">{description}</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="relative grid h-10 w-10 place-items-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-700 text-xs font-semibold text-white">
                  5
                </span>
              </button>
              <div className="hidden items-center gap-3 sm:flex">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-stone-200 text-stone-500">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-xs text-stone-500">{role}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <Panel key={metric.label} className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-stone-500">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
                      {metric.value}
                    </p>
                    <p className="mt-2 text-xs text-stone-500">{metric.note}</p>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-700">
                    <metric.icon className="h-5 w-5" />
                  </span>
                </div>
              </Panel>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              {primaryPanel}
              <Panel className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">{queueTitle}</h2>
                  <button className="text-sm font-medium text-red-700 hover:text-red-900">
                    View All
                  </button>
                </div>
                {queueItems.length > 0 ? (
                  <div className="mt-4 divide-y divide-stone-200">
                    {queueItems.map((item) => (
                    <div key={item.title} className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm text-stone-500">{item.meta}</p>
                      </div>
                      <div className="text-right">
                        {item.amount ? (
                          <p className="text-sm font-semibold text-stone-950">{item.amount}</p>
                        ) : null}
                        <span className="mt-2 inline-block rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                          {item.status}
                        </span>
                      </div>
                    </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-stone-200 p-6 text-center text-sm text-stone-500">
                    No records yet.
                  </div>
                )}
              </Panel>
            </div>

            <Panel className="p-5">
              <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
              {activityItems.length > 0 ? (
                <div className="mt-4 divide-y divide-stone-200">
                  {activityItems.map((activity) => (
                  <div key={activity.title} className="py-4">
                    <div className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                      <div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="text-sm font-semibold">{activity.title}</p>
                          <p className="text-xs text-stone-500">{activity.date}</p>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-stone-600">
                          {activity.body}
                        </p>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-stone-200 p-6 text-center text-sm text-stone-500">
                  No recent activity yet.
                </div>
              )}
            </Panel>
          </div>
        </main>
      </div>
    </div>
  );
}

export function BillingClerkDashboard() {
  return (
    <StaffDashboard
      role="Billing Clerk"
      name="Billing Clerk"
      title="Billing Clerk Dashboard"
      description="Monitor customer balances, progress billings, receipts, and invoice follow-ups."
      navItems={clerkNav}
      metrics={[
        { label: "Pending Billings", value: "0", note: "No records yet", icon: ReceiptText },
        { label: "Collected This Month", value: "PHP 0.00", note: "No payments recorded", icon: WalletCards },
        { label: "Overdue Accounts", value: "0", note: "No customer balances yet", icon: Users },
        { label: "Invoices Ready", value: "0", note: "No invoices prepared", icon: FileText },
      ]}
      primaryPanel={
        <Panel className="p-6">
          <p className="text-sm font-semibold text-red-700">Billing Control</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Prioritize collections and progress billing reviews.
          </h1>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {["Validate Payment", "Prepare Invoice", "Send Reminder"].map((action) => (
              <button
                key={action}
                className="rounded-lg border border-stone-200 bg-white px-4 py-4 text-left text-sm font-semibold shadow-sm hover:border-red-200 hover:bg-red-50"
              >
                {action}
              </button>
            ))}
          </div>
        </Panel>
      }
      queueTitle="Billing Queue"
      queueItems={[]}
      activityItems={[]}
    />
  );
}

export function AdminDashboard() {
  return (
    <StaffDashboard
      role="Admin"
      name="Admin"
      title="Admin Dashboard"
      description="Oversee projects, approvals, estimates, billing health, and user access."
      navItems={adminNav}
      metrics={[
        { label: "Active Projects", value: "0", note: "No project records yet", icon: FolderKanban },
        { label: "Pending Approvals", value: "0", note: "No approvals yet", icon: ShieldCheck },
        { label: "Projected Revenue", value: "PHP 0.00", note: "No project pipeline yet", icon: Calculator },
        { label: "System Users", value: "3", note: "Demo role accounts only", icon: Users },
      ]}
      primaryPanel={
        <Panel className="p-6">
          <p className="text-sm font-semibold text-red-700">Operations Command</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Keep project cost, billing, and approvals aligned.
          </h1>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {["Review Approvals", "Manage Users", "Open Reports"].map((action) => (
              <button
                key={action}
                className="rounded-lg border border-stone-200 bg-white px-4 py-4 text-left text-sm font-semibold shadow-sm hover:border-red-200 hover:bg-red-50"
              >
                {action}
              </button>
            ))}
          </div>
        </Panel>
      }
      queueTitle="Approval Queue"
      queueItems={[]}
      activityItems={[]}
    />
  );
}
