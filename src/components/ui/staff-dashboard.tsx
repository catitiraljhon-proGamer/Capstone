"use client";

import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Bell,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Gauge,
  LogOut,
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
  navItems: { label: string; icon: IconType; href: string; active?: boolean }[];
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
  { label: "Messages", icon: Bell, href: "/billing-clerk/messages" },
  { label: "Progress Billings", icon: ReceiptText, href: "/billing-clerk/progress-billings" },
  { label: "Payments", icon: WalletCards, href: "/billing-clerk/payments" },
  { label: "Invoices", icon: FileText, href: "/billing-clerk/invoices" },
  { label: "Customer Accounts", icon: Users, href: "/billing-clerk/customer-accounts" },
  { label: "Reports", icon: ClipboardCheck, href: "/billing-clerk/reports" },
];

const adminNav = [
  { label: "Dashboard", icon: Gauge, href: "/admin" },
  { label: "Messages", icon: Bell, href: "/admin/messages" },
  { label: "Projects", icon: FolderKanban, href: "/admin/projects" },
  { label: "Approvals", icon: ShieldCheck, href: "/admin/approvals" },
  { label: "Billing Control", icon: ReceiptText, href: "/admin/billing-control" },
  { label: "Users & Roles", icon: Users, href: "/admin/users-roles" },
  { label: "Reports", icon: ClipboardCheck, href: "/admin/reports" },
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
      <nav className="flex-1 space-y-1 px-4 py-5">
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
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="px-4 pb-6">
        <Link
          href="/login"
          onClick={onNavigate}
          className="flex items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-950"
        >
          <LogOut className="h-5 w-5" />
          Log out
        </Link>
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
  const [isLightMode, setIsLightMode] = useState(true);

  return (
    <div
      className={[
        "min-h-screen bg-stone-50 text-stone-950",
        isLightMode ? "" : "night-mode",
      ].join(" ")}
    >
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <StaffSidebar navItems={navItems} />
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
              navItems={navItems}
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
              <ThemeToggle
                isLightMode={isLightMode}
                onToggle={() => setIsLightMode((current) => !current)}
              />
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

export function BillingClerkDashboard() {
  return (
    <StaffDashboard
      role="Billing Clerk"
      name="Billing Clerk"
      title="Billing Clerk Dashboard"
      description="Monitor customer balances, progress billings, receipts, and invoice follow-ups."
      navItems={setActiveNav(clerkNav, "Dashboard")}
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
      description="Oversee projects, approvals, billing health, and user access."
      navItems={setActiveNav(adminNav, "Dashboard")}
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

export function BillingClerkSectionPage({
  activeLabel,
  title,
  description,
}: {
  activeLabel: string;
  title: string;
  description: string;
}) {
  return (
    <StaffDashboard
      role="Billing Clerk"
      name="Billing Clerk"
      title={title}
      description={description}
      navItems={setActiveNav(clerkNav, activeLabel)}
      metrics={[
        { label: "Open Records", value: "0", note: "No records yet", icon: ReceiptText },
        { label: "Pending Review", value: "0", note: "No pending items", icon: ClipboardCheck },
        { label: "Customers", value: "0", note: "No customer records yet", icon: Users },
        { label: "Reports Ready", value: "0", note: "No reports generated", icon: FileText },
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
  return (
    <StaffDashboard
      role="Admin"
      name="Admin"
      title={title}
      description={description}
      navItems={setActiveNav(adminNav, activeLabel)}
      metrics={[
        { label: "Open Records", value: "0", note: "No records yet", icon: FolderKanban },
        { label: "Pending Review", value: "0", note: "No pending items", icon: ShieldCheck },
        { label: "Users", value: "3", note: "Demo role accounts only", icon: Users },
        { label: "Reports Ready", value: "0", note: "No reports generated", icon: ClipboardCheck },
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
