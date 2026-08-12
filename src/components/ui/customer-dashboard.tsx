import { BrandLogo } from "@/components/ui/brand-logo";
import {
  Bell,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FilePlus2,
  FileText,
  FolderOpen,
  Gauge,
  HelpCircle,
  Home,
  LogOut,
  Mail,
  MessageSquareText,
  ReceiptText,
  User,
  UserRound,
  WalletCards,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

type IconType = ComponentType<{ className?: string }>;

const houseImage = "/House/image.png";

const sidebarItems: { label: string; icon: IconType; href: string; active?: boolean }[] = [
  { label: "Dashboard", icon: Gauge, href: "/customer", active: true },
  { label: "My House Design", icon: Home, href: "#" },
  { label: "Design Requests", icon: ClipboardList, href: "#" },
  { label: "Messages", icon: Mail, href: "/customer/messages" },
  { label: "Billing & Payments", icon: ReceiptText, href: "#" },
  { label: "Documents", icon: FileText, href: "#" },
  { label: "My Profile", icon: UserRound, href: "#" },
  { label: "Notifications", icon: Bell, href: "#" },
  { label: "Support", icon: HelpCircle, href: "#" },
];

const transactions: {
  title: string;
  date: string;
  amount: string;
  status: string;
}[] = [];

const updates: {
  title: string;
  date: string;
  body: string;
  tone: string;
}[] = [];

const quickActions: {
  title: string;
  body: string;
  icon: IconType;
  tone: string;
}[] = [
  {
    title: "New Design Request",
    body: "Start a new house design request.",
    icon: FilePlus2,
    tone: "bg-red-50 text-red-700",
  },
  {
    title: "Send Message",
    body: "Message our design team.",
    icon: MessageSquareText,
    tone: "bg-rose-50 text-rose-700",
  },
  {
    title: "View Documents",
    body: "See your files and approvals.",
    icon: FolderOpen,
    tone: "bg-stone-100 text-stone-700",
  },
  {
    title: "Make Payment",
    body: "View and settle your payments.",
    icon: CreditCard,
    tone: "bg-red-100 text-red-800",
  },
];

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

export function CustomerDashboard() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-24 items-center border-b border-stone-200 px-5">
          <BrandLogo compact />
        </div>

        <nav className="flex-1 space-y-1 px-4 py-5">
          {sidebarItems.map((item) => (
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
              <p className="text-xl font-semibold tracking-tight text-stone-950">
                Welcome back, John Doe
              </p>
              <p className="mt-1 text-sm text-stone-600">
                Here is what is happening with your house design and billing.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="relative grid h-10 w-10 place-items-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-700 text-xs font-semibold text-white">
                  3
                </span>
              </button>
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-stone-200 text-stone-500">
                  <User className="h-6 w-6" />
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold">John Doe</p>
                  <p className="text-xs text-stone-500">Customer</p>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-stone-400 sm:block" />
              </div>
            </div>
          </div>
        </header>

        <main className="grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
          <div className="space-y-6">
            <Panel className="relative min-h-[280px] overflow-hidden">
              <Image
                src={houseImage}
                alt="Modern house design"
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 60vw, 100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-white/10" />
              <div className="relative max-w-sm p-8">
                <h1 className="text-4xl font-semibold leading-tight tracking-tight text-stone-950">
                  Design Your Dream Home
                </h1>
                <p className="mt-5 text-sm leading-6 text-stone-600">
                  Review plans, approvals, billing, and project updates with G4
                  Builders Inc.
                </p>
                <button className="mt-7 rounded-lg bg-red-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-800">
                  View My Design
                </button>
              </div>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold tracking-tight">
                  My House Design
                </h2>
                <button className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
                  View All
                </button>
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-stone-200 p-8 text-center">
                <p className="text-sm font-semibold text-stone-950">
                  No house design record yet.
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
                  Once a design request is created, its status, estimate,
                  updates, and approval progress will appear here.
                </p>
              </div>
            </Panel>

            <Panel className="p-5">
              <h2 className="text-lg font-semibold tracking-tight">
                Quick Actions
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {quickActions.map((action) => (
                  <Link
                    key={action.title}
                    href={action.title === "Send Message" ? "/customer/messages" : "#"}
                    className="flex min-h-36 items-center gap-4 rounded-lg border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-red-200 hover:bg-red-50/40"
                  >
                    <span
                      className={`grid h-14 w-14 shrink-0 place-items-center rounded-lg ${action.tone}`}
                    >
                      <action.icon className="h-7 w-7" />
                    </span>
                    <span>
                      <span className="block font-semibold text-stone-950">
                        {action.title}
                      </span>
                      <span className="mt-2 block text-sm leading-5 text-stone-600">
                        {action.body}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-700">
                  <WalletCards className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">
                  Billing Overview
                </h2>
              </div>
              <div className="mt-6 space-y-5 text-sm">
                <div>
                  <p className="text-stone-500">Total Contract Price</p>
                  <p className="mt-1 text-2xl font-semibold text-red-700">
                    PHP 0.00
                  </p>
                </div>
                <div>
                  <p className="text-stone-500">Total Paid</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-700">
                    PHP 0.00
                  </p>
                </div>
                <div>
                  <p className="text-stone-500">Balance Due</p>
                  <p className="mt-1 text-xl font-semibold text-red-700">
                    PHP 0.00
                  </p>
                </div>
              </div>
              <button className="mt-6 w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800">
                View Billing Details
              </button>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">
                  Latest Transactions
                </h2>
                <button className="text-sm font-medium text-red-700 hover:text-red-900">
                  View All
                </button>
              </div>
              {transactions.length > 0 ? (
                <div className="mt-4 divide-y divide-stone-200">
                  {transactions.map((transaction) => (
                  <div key={transaction.title} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">
                          {transaction.title}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {transaction.date}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {transaction.amount}
                        </p>
                        <span
                          className={[
                            "mt-2 inline-block rounded-md px-2 py-1 text-xs font-semibold",
                            transaction.status === "Paid"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700",
                          ].join(" ")}
                        >
                          {transaction.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-stone-200 p-6 text-center text-sm text-stone-500">
                  No transactions recorded yet.
                </div>
              )}
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">
                  Project Updates
                </h2>
                <button className="text-sm font-medium text-red-700 hover:text-red-900">
                  View All
                </button>
              </div>
              {updates.length > 0 ? (
                <div className="mt-4 divide-y divide-stone-200">
                  {updates.map((update) => (
                  <div key={update.title} className="py-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${update.tone}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-semibold">
                            {update.title}
                          </p>
                          <p className="shrink-0 text-xs text-stone-500">
                            {update.date}
                          </p>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-stone-600">
                          {update.body}
                        </p>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-stone-200 p-6 text-center text-sm text-stone-500">
                  No project updates yet.
                </div>
              )}
            </Panel>
          </div>
        </main>
      </div>
    </div>
  );
}
