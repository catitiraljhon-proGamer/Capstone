"use client";

import { AccountMenu } from "@/components/ui/account-menu";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MobileNavigation } from "@/components/ui/mobile-navigation";
import { NotificationBell } from "@/components/customer/customer-notification-bell";
import { useAdminDashboardData } from "@/lib/admin-dashboard-data";
import { useSessionUser } from "@/lib/session-store";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import type { BillingSection } from "@/types/billing";
import {
  Calculator,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Gauge,
  House,
  Menu,
  ReceiptText,
  ShieldCheck,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";

type IconType = ComponentType<{ className?: string }>;

type StaffDashboardProps = {
  role: "Billing Clerk" | "Admin";
  name: string;
  title: string;
  description: string;
  navItems: {
    label: string;
    icon: IconType;
    href: string;
    active?: boolean;
  }[];
  metrics: { label: string; value: string; note: string; icon: IconType }[];
  primaryPanel: ReactNode;
  queueTitle: string;
  queueItems: { title: string; meta: string; amount?: string; status: string }[];
  activityItems: { title: string; body: string; date: string }[];
  footerContent?: ReactNode;
  mainContent?: ReactNode;
};

const clerkNav = [
  { label: "Dashboard", icon: Gauge, href: "/billing-clerk" },
  { label: "Progress Billings", icon: ReceiptText, href: "/billing-clerk/progress-billings" },
  { label: "Payments", icon: WalletCards, href: "/billing-clerk/payments" },
  { label: "Invoices", icon: FileText, href: "/billing-clerk/invoices" },
  { label: "Schedule", icon: CalendarDays, href: "/billing-clerk/schedule" },
  { label: "Customer Accounts", icon: Users, href: "/billing-clerk/customer-accounts" },
  { label: "Reports", icon: ClipboardCheck, href: "/billing-clerk/reports" },
];

const adminNav = [
  { label: "Dashboard", icon: Gauge, href: "/admin" },
  { label: "Client", icon: Users, href: "/admin/clients" },
  { label: "House Design", icon: House, href: "/admin/house-designs" },
  { label: "Cost Estimates", icon: Calculator, href: "/admin/cost-estimates" },
  { label: "Projects", icon: FolderKanban, href: "/admin/projects" },
  { label: "Approvals", icon: ShieldCheck, href: "/admin/approvals" },
  { label: "Scheduling", icon: CalendarDays, href: "/admin/scheduling" },
  { label: "Reports", icon: ClipboardCheck, href: "/admin/reports" },
  { label: "Users & Roles", icon: Users, href: "/admin/users-roles" },
  { label: "Maintenance", icon: Wrench, href: "/admin/maintenance" },
  { label: "Audit Logs", icon: FileText, href: "/admin/audit-logs" },
];

const setActiveNav = (
  items: StaffDashboardProps["navItems"],
  activeLabel: string,
) => items.map((item) => ({ ...item, active: item.label === activeLabel }));

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function StaffSidebar({
  navItems,
  onNavigate,
}: {
  navItems: StaffDashboardProps["navItems"];
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className={`flex h-24 shrink-0 items-center border-b border-stone-200 px-5 ${onNavigate ? "pr-16" : ""}`}>
        <BrandLogo compact />
      </div>
      <nav aria-label="Staff navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-5">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className={[
              "flex items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium transition",
              item.active
                ? "bg-red-700 text-white shadow-sm"
                : "text-stone-600 hover:bg-red-50 hover:text-red-800",
            ].join(" ")}
          >
            <item.icon className="h-5 w-5" />
            <span className="min-w-0 flex-1">{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
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
  footerContent,
  mainContent,
}: StaffDashboardProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useSessionUser();

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <StaffSidebar navItems={navItems} />
      </aside>

      <MobileNavigation open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <StaffSidebar navItems={navItems} onNavigate={() => setIsSidebarOpen(false)} />
      </MobileNavigation>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100 lg:hidden"
                aria-label="Open navigation menu"
                aria-haspopup="dialog"
                aria-expanded={isSidebarOpen}
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-base font-semibold tracking-tight break-words sm:text-xl">{title}</p>
                <p className="mt-1 hidden text-sm text-stone-600 sm:block">{description}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />
              <AccountMenu name={user?.name ?? name} role={role} />
            </div>
            <p className="col-span-2 text-xs leading-5 text-stone-600 sm:hidden">{description}</p>
          </div>
        </header>

        <main className="min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {mainContent ? (
            mainContent
          ) : (
            <>
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
            <div className="min-w-0 space-y-6">
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
          {footerContent ? footerContent : null}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function AdminOverviewCard({
  label,
  value,
  note,
  href,
  icon: Icon,
}: {
  label: string;
  value: number;
  note: string;
  href: string;
  icon: IconType;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:bg-red-50/40"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
            {value}
          </p>
          <p className="mt-2 text-xs text-stone-500">{note}</p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Link>
  );
}

function AdminDashboardOverview() {
  const { summary, pendingApprovals, isLoading, error } = useAdminDashboardData();

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <p className="text-sm text-stone-500">Loading dashboard records from MongoDB…</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminOverviewCard
          label="Active Projects"
          value={summary.activeProjects}
          note={
            summary.activeProjects === 0
              ? "No Active Projects Yet"
              : `${summary.activeProjects} active projects`
          }
          href="/admin/projects"
          icon={FolderKanban}
        />
        <AdminOverviewCard
          label="Pending Approvals"
          value={summary.pendingApprovals}
          note={
            summary.pendingApprovals === 0
              ? "No Pending Approvals"
              : `${summary.pendingApprovals} records waiting for review`
          }
          href="/admin/approvals"
          icon={ShieldCheck}
        />
        <AdminOverviewCard label="Active Users" value={summary.totalUsers} note="Active system users" href="/admin/users-roles" icon={Users} />
        <AdminOverviewCard
          label="Total Clients"
          value={summary.totalClients}
          note={
            summary.totalClients === 0
              ? "No Registered Clients Yet"
              : "Registered Clients"
          }
          href="/admin/clients"
          icon={Users}
        />
      </div>

      <Panel className="p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Pending Approvals
            </h2>
            <Link
              href="/admin/approvals"
              className="text-sm font-medium text-red-700 hover:text-red-900"
            >
              View All
            </Link>
          </div>

          {pendingApprovals.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase text-stone-500">
                    <th className="border-b border-stone-200 px-3 py-3">
                      Reference
                    </th>
                    <th className="border-b border-stone-200 px-3 py-3">
                      Client
                    </th>
                    <th className="border-b border-stone-200 px-3 py-3">
                      Type
                    </th>
                    <th className="border-b border-stone-200 px-3 py-3">
                      Status
                    </th>
                    <th className="border-b border-stone-200 px-3 py-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((approval) => (
                    <tr key={approval.reference}>
                      <td className="border-b border-stone-100 px-3 py-4 font-semibold">
                        {approval.reference}
                      </td>
                      <td className="border-b border-stone-100 px-3 py-4">
                        {approval.client}
                      </td>
                      <td className="border-b border-stone-100 px-3 py-4">
                        {approval.type}
                      </td>
                      <td className="border-b border-stone-100 px-3 py-4">
                        <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                          {approval.status}
                        </span>
                      </td>
                      <td className="border-b border-stone-100 px-3 py-4 text-right">
                        <Link
                          href={approval.href}
                          className="text-sm font-semibold text-red-700 hover:text-red-900"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-stone-200 p-6 text-center text-sm text-stone-500">
              No pending approvals.
            </div>
          )}
      </Panel>
    </div>
  );
}

export function BillingClerkDashboard() {
  return <BillingClerkSectionPage activeLabel="Dashboard" title="Billing Clerk Dashboard" description="Manage progress billings, payments, invoices, and receipts." />;
}

export function AdminDashboard() {
  return (
    <StaffDashboard
      role="Admin"
      name="Admin"
      title="Admin Dashboard"
      description="Quick overview of projects, approvals, clients, and recent system activity."
      navItems={setActiveNav(adminNav, "Dashboard")}
      metrics={[]}
      primaryPanel={null}
      queueTitle="Pending Approvals"
      queueItems={[]}
      activityItems={[]}
      mainContent={<AdminDashboardOverview />}
    />
  );
}

/** Billing workspace sections, or a page with its own content (such as the Schedule). */
export function BillingClerkSectionPage({ activeLabel, title, description, mainContent }: { title: string; description: string } & (
  { activeLabel: BillingSection; mainContent?: undefined } | { activeLabel: string; mainContent: ReactNode }
)) {
  return <StaffDashboard role="Billing Clerk" name="Billing Clerk" title={title} description={description} navItems={setActiveNav(clerkNav, activeLabel)} metrics={[]} primaryPanel={null} queueTitle="" queueItems={[]} activityItems={[]} mainContent={mainContent ?? <BillingWorkspace section={activeLabel as BillingSection} />} />;
}

export function AdminSectionPage({
  activeLabel,
  title,
  description,
  children,
  mainContent,
}: {
  activeLabel: string;
  title: string;
  description: string;
  children?: ReactNode;
  mainContent?: ReactNode;
}) {
  const { summary } = useAdminDashboardData();
  return (
    <StaffDashboard
      role="Admin"
      name="Admin"
      title={title}
      description={description}
      navItems={setActiveNav(adminNav, activeLabel)}
      metrics={[
        { label: "Active Projects", value: String(summary.activeProjects), note: "Open project records", icon: FolderKanban },
        { label: "Pending Review", value: String(summary.pendingApprovals), note: "Approval records", icon: ShieldCheck },
        { label: "Users", value: String(summary.totalUsers), note: "Active accounts", icon: Users },
        { label: "Clients", value: String(summary.totalClients), note: "Active customer accounts", icon: Users },
      ]}
      primaryPanel={
        <Panel className="p-6">
          <p className="text-sm font-semibold text-red-700">{activeLabel}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            This screen is ready for {activeLabel.toLowerCase()} records once the
            system has connected data.
          </p>
        </Panel>
      }
      queueTitle={`${activeLabel} Queue`}
      queueItems={[]}
      activityItems={[]}
      footerContent={children}
      mainContent={mainContent}
    />
  );
}
