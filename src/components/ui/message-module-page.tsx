"use client";

import { BackButton } from "@/components/ui/back-button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MobileNavigation } from "@/components/ui/mobile-navigation";
import { NotificationBell } from "@/components/ui/customer-notification-bell";
import { MessageCenter } from "@/components/ui/message-center";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoutButton } from "@/components/ui/logout-button";
import { useSessionUser } from "@/lib/session-store";
import { useUnreadStaffMessages } from "@/lib/staff-message-notifications";
import type { MessageRecipientRole } from "@/types/domain";
import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  HelpCircle,
  Home,
  House,
  Mail,
  Menu,
  ReceiptText,
  ShieldCheck,
  User,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ComponentType } from "react";

type IconType = ComponentType<{ className?: string }>;
type MessageRole = "Customer" | "Billing Clerk" | "Admin";
type MessageNavItem = {
  label: string;
  icon: IconType;
  href: string;
  active?: boolean;
  badge?: number;
};

type MessageModulePageProps = {
  role: MessageRole;
  dashboardHref: string;
  initialRecipientRole?: MessageRecipientRole;
  initialCustomerId?: string | null;
};

const customerNav = [
  { label: "Dashboard", icon: Gauge, href: "/customer" },
  { label: "My House Design", icon: Home, href: "/customer/house-design" },
  { label: "Design Requests", icon: ClipboardList, href: "/customer/design-requests" },
  { label: "Messages", icon: Mail, href: "/customer/messages", active: true },
  { label: "Billing Status", icon: ReceiptText, href: "/customer/billing" },
  { label: "Documents", icon: FileText, href: "/customer/documents" },
  { label: "My Profile", icon: UserRound, href: "/customer/profile" },
  { label: "Support", icon: HelpCircle, href: "/customer/support" },
];

const clerkNav = [
  { label: "Dashboard", icon: Gauge, href: "/billing-clerk" },
  { label: "Messages", icon: Mail, href: "/billing-clerk/messages", active: true },
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
  { label: "Messages", icon: Mail, href: "/admin/messages", active: true },
  { label: "Scheduling", icon: CalendarDays, href: "/admin/scheduling" },
  { label: "Reports", icon: ClipboardCheck, href: "/admin/reports" },
  { label: "Users & Roles", icon: Users, href: "/admin/users-roles" },
  { label: "Audit Logs", icon: FileText, href: "/admin/audit-logs" },
];

const navByRole: Record<MessageRole, MessageNavItem[]> = {
  Customer: customerNav,
  "Billing Clerk": clerkNav,
  Admin: adminNav,
};

function MessageSidebar({
  navItems,
  onNavigate,
}: {
  navItems: MessageNavItem[];
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className={`flex h-24 shrink-0 items-center border-b border-stone-200 px-5 ${onNavigate ? "pr-16" : ""}`}>
        <BrandLogo compact />
      </div>
      <nav aria-label="Workspace navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-5">
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
      <div className="shrink-0 px-4 pb-6">
        <LogoutButton onLogout={onNavigate} />
      </div>
    </>
  );
}

export function MessageModulePage({
  role,
  dashboardHref,
  initialRecipientRole,
  initialCustomerId,
}: MessageModulePageProps) {
  const { unreadCount } = useUnreadStaffMessages(role !== "Customer");
  const navItems = navByRole[role].map((item) =>
    item.label === "Messages" && role !== "Customer"
      ? { ...item, badge: unreadCount }
      : item,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useSessionUser();

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <MessageSidebar navItems={navItems} />
      </aside>

      <MobileNavigation open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <MessageSidebar navItems={navItems} onNavigate={() => setIsSidebarOpen(false)} />
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
                <p className="text-base font-semibold tracking-tight sm:text-xl">
                  Messages
                </p>
                <p className="mt-1 hidden text-sm text-stone-600 sm:block">
                  {role === "Customer"
                    ? "Choose Admin or Billing Clerk based on your concern."
                    : `Review customer concerns addressed to ${role}.`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <NotificationBell />
              <BackButton href={dashboardHref} className="hidden xl:inline-flex" />
              <div className="hidden h-12 w-12 place-items-center rounded-full bg-stone-200 text-stone-500 md:grid">
                <User className="h-6 w-6" />
              </div>
              <div className="hidden min-w-0 max-w-40 md:block">
                <p className="truncate text-sm font-semibold" title={user?.name ?? role}>{user?.name ?? role}</p>
                <p className="text-xs text-stone-500">{role}</p>
              </div>
            </div>
            <p className="col-span-2 text-xs leading-5 text-stone-600 sm:hidden">
              {role === "Customer"
                ? "Choose Admin or Billing Clerk based on your concern."
                : `Review customer concerns addressed to ${role}.`}
            </p>
          </div>
        </header>

        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto min-w-0 max-w-6xl">
            <MessageCenter
              key={
                role === "Customer"
                  ? initialRecipientRole
                  : `${role}:${initialCustomerId ?? ""}`
              }
              currentRole={role}
              title={role === "Customer" ? "Contact the G4 Builders Team" : `${role} Inbox`}
              initialRecipientRole={initialRecipientRole}
              initialCustomerId={initialCustomerId}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
