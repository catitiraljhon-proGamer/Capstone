import { BrandLogo } from "@/components/ui/brand-logo";
import { MessageCenter } from "@/components/ui/message-center";
import {
  Bell,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  HelpCircle,
  Home,
  LogOut,
  Mail,
  ReceiptText,
  ShieldCheck,
  User,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

type IconType = ComponentType<{ className?: string }>;
type MessageRole = "Customer" | "Billing Clerk" | "Admin";

type MessageModulePageProps = {
  role: MessageRole;
  name: string;
  dashboardHref: string;
};

const customerNav = [
  { label: "Dashboard", icon: Gauge, href: "/customer" },
  { label: "My House Design", icon: Home, href: "#" },
  { label: "Design Requests", icon: ClipboardList, href: "#" },
  { label: "Messages", icon: Mail, href: "/customer/messages", active: true },
  { label: "Billing & Payments", icon: ReceiptText, href: "#" },
  { label: "Documents", icon: FileText, href: "#" },
  { label: "My Profile", icon: UserRound, href: "#" },
  { label: "Notifications", icon: Bell, href: "#" },
  { label: "Support", icon: HelpCircle, href: "#" },
];

const clerkNav = [
  { label: "Dashboard", icon: Gauge, href: "/billing-clerk" },
  { label: "Messages", icon: Mail, href: "/billing-clerk/messages", active: true },
  { label: "Progress Billings", icon: ReceiptText, href: "#" },
  { label: "Payments", icon: WalletCards, href: "#" },
  { label: "Invoices", icon: FileText, href: "#" },
  { label: "Customer Accounts", icon: Users, href: "#" },
  { label: "Reports", icon: ClipboardCheck, href: "#" },
];

const adminNav = [
  { label: "Dashboard", icon: Gauge, href: "/admin" },
  { label: "Messages", icon: Mail, href: "/admin/messages", active: true },
  { label: "Projects", icon: FolderKanban, href: "#" },
  { label: "Approvals", icon: ShieldCheck, href: "#" },
  { label: "Cost Estimates", icon: Calculator, href: "#" },
  { label: "Billing Control", icon: ReceiptText, href: "#" },
  { label: "Users & Roles", icon: Users, href: "#" },
  { label: "Reports", icon: ClipboardCheck, href: "#" },
];

const navByRole: Record<
  MessageRole,
  { label: string; icon: IconType; href: string; active?: boolean }[]
> = {
  Customer: customerNav,
  "Billing Clerk": clerkNav,
  Admin: adminNav,
};

export function MessageModulePage({
  role,
  name,
  dashboardHref,
}: MessageModulePageProps) {
  const navItems = navByRole[role];

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
              <p className="text-xl font-semibold tracking-tight">
                Messages
              </p>
              <p className="mt-1 text-sm text-stone-600">
                Customer, billing clerk, and admin conversation thread.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={dashboardHref}
                className="hidden rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 sm:inline-flex"
              >
                Back to Dashboard
              </Link>
              <div className="grid h-12 w-12 place-items-center rounded-full bg-stone-200 text-stone-500">
                <User className="h-6 w-6" />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">{name}</p>
                <p className="text-xs text-stone-500">{role}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <MessageCenter
              currentRole={role}
              title={role === "Customer" ? "Message Staff" : "Customer Messages"}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
