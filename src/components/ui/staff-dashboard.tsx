"use client";

import { BrandLogo } from "@/components/ui/brand-logo";
import { NotificationBell } from "@/components/ui/customer-notification-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoutButton } from "@/components/ui/logout-button";
import { useAdminDashboardData } from "@/lib/admin-dashboard-data";
import { useSessionUser } from "@/lib/session-store";
import { useBillingDashboardData } from "@/lib/billing-dashboard-data";
import { useUnreadStaffMessages } from "@/lib/staff-message-notifications";
import { formatPeso } from "@/components/ui/house-design-data";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Gauge,
  House,
  Mail,
  Menu,
  ReceiptText,
  ShieldCheck,
  User,
  Users,
  WalletCards,
  X,
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
    badge?: number;
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
  { label: "Messages", icon: Mail, href: "/billing-clerk/messages" },
  { label: "Progress Billings", icon: ReceiptText, href: "/billing-clerk/progress-billings" },
  { label: "Payments", icon: WalletCards, href: "/billing-clerk/payments" },
  { label: "Invoices", icon: FileText, href: "/billing-clerk/invoices" },
  { label: "Customer Accounts", icon: Users, href: "/billing-clerk/customer-accounts" },
  { label: "Reports", icon: ClipboardCheck, href: "/billing-clerk/reports" },
];

const adminNav = [
  { label: "Dashboard", icon: Gauge, href: "/admin" },
  { label: "Client", icon: Users, href: "/admin/clients" },
  { label: "House Design", icon: House, href: "/admin/house-designs" },
  { label: "Projects", icon: FolderKanban, href: "/admin/projects" },
  { label: "Approvals", icon: ShieldCheck, href: "/admin/approvals" },
  { label: "Billing", icon: ReceiptText, href: "/admin/billing-control" },
  { label: "Messages", icon: Mail, href: "/admin/messages" },
  { label: "Scheduling", icon: CalendarDays, href: "/admin/scheduling" },
  { label: "Reports", icon: ClipboardCheck, href: "/admin/reports" },
  { label: "Users & Roles", icon: Users, href: "/admin/users-roles" },
  { label: "Audit Logs", icon: FileText, href: "/admin/audit-logs" },
];

const setActiveNav = (
  items: StaffDashboardProps["navItems"],
  activeLabel: string,
) => items.map((item) => ({ ...item, active: item.label === activeLabel }));

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}>
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
      <div className="flex h-24 items-center border-b border-stone-200 px-5">
        <BrandLogo compact />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
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
            {item.badge && item.badge > 0 ? (
              <span
                className={[
                  "grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  item.active ? "bg-white text-red-700" : "bg-red-700 text-white",
                ].join(" ")}
                aria-label={`${item.badge} unread messages`}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="px-4 pb-6">
        <LogoutButton onLogout={onNavigate} />
      </div>
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
  const { unreadCount } = useUnreadStaffMessages(true);
  const messagesHref = role === "Admin" ? "/admin/messages" : "/billing-clerk/messages";
  const navItemsWithMessageCount = navItems.map((item) =>
    item.href === messagesHref ? { ...item, badge: unreadCount } : item,
  );

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <StaffSidebar navItems={navItemsWithMessageCount} />
      </aside>

      {isSidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-transparent"
            aria-label="Close navigation menu"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside className="relative flex h-full w-72 flex-col border-r border-stone-200 bg-white shadow-xl">
            <button
              type="button"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-100"
              aria-label="Close navigation menu"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <StaffSidebar
              navItems={navItemsWithMessageCount}
              onNavigate={() => setIsSidebarOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100 lg:hidden"
                aria-label="Open navigation menu"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-xl font-semibold tracking-tight">{title}</p>
                <p className="mt-1 text-sm text-stone-600">{description}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <NotificationBell />
              <div className="hidden items-center gap-3 sm:flex">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-stone-200 text-stone-500">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{user?.name ?? name}</p>
                  <p className="text-xs text-stone-500">{role}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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
              ? "No active projects yet"
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
              ? "No pending approvals"
              : `${summary.pendingApprovals} records waiting for review`
          }
          href="/admin/approvals"
          icon={ShieldCheck}
        />
        <AdminOverviewCard
          label="Pending Billing"
          value={summary.pendingBilling}
          note={
            summary.pendingBilling === 0
              ? "No pending billing records"
              : `${summary.pendingBilling} billing records pending`
          }
          href="/admin/billing-control"
          icon={ReceiptText}
        />
        <AdminOverviewCard
          label="Total Clients"
          value={summary.totalClients}
          note={
            summary.totalClients === 0
              ? "No registered clients yet"
              : "Registered clients"
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
  const dashboard = useBillingDashboardData();
  return (
    <StaffDashboard
      role="Billing Clerk"
      name="Billing Clerk"
      title="Billing Clerk Dashboard"
      description="Monitor customer balances, progress billings, receipts, and invoice follow-ups."
      navItems={setActiveNav(clerkNav, "Dashboard")}
      metrics={[
        { label: "Pending Billings", value: String(dashboard.pendingBillings), note: "Ready, sent, or overdue invoices", icon: ReceiptText },
        { label: "Collected This Month", value: formatPeso(dashboard.collectedThisMonth), note: "Verified payments", icon: WalletCards },
        { label: "Overdue Accounts", value: String(dashboard.overdueAccounts), note: "Overdue invoice records", icon: Users },
        { label: "Invoices Ready", value: String(dashboard.invoicesReady), note: "Ready for release", icon: FileText },
      ]}
      primaryPanel={
        <Panel className="p-6">
          {dashboard.error ? (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {dashboard.error}
            </p>
          ) : null}
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
      queueItems={dashboard.queueItems.map((item) => ({
        ...item,
        amount: formatPeso(item.amount),
      }))}
      activityItems={dashboard.activityItems.map((item) => ({
        ...item,
        date: new Date(item.date).toLocaleString("en-PH"),
      }))}
    />
  );
}

export function AdminDashboard() {
  return (
    <StaffDashboard
      role="Admin"
      name="Admin"
      title="Admin Dashboard"
      description="Quick overview of projects, approvals, billing, clients, and recent system activity."
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

export function BillingClerkSectionPage({
  activeLabel,
  title,
  description,
}: {
  activeLabel: string;
  title: string;
  description: string;
}) {
  const dashboard = useBillingDashboardData();
  return (
    <StaffDashboard
      role="Billing Clerk"
      name="Billing Clerk"
      title={title}
      description={description}
      navItems={setActiveNav(clerkNav, activeLabel)}
      metrics={[
        { label: "Open Records", value: String(dashboard.pendingBillings), note: "Active billing records", icon: ReceiptText },
        { label: "Pending Review", value: String(dashboard.invoicesReady), note: "Invoices ready", icon: ClipboardCheck },
        { label: "Overdue Accounts", value: String(dashboard.overdueAccounts), note: "Needs follow-up", icon: Users },
        { label: "Collected This Month", value: formatPeso(dashboard.collectedThisMonth), note: "Verified payments", icon: FileText },
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
    />
  );
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
        { label: "Pending Billing", value: String(summary.pendingBilling), note: "Open billing records", icon: ClipboardCheck },
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
