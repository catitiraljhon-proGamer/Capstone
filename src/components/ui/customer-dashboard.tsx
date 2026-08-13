"use client";

import { BrandLogo } from "@/components/ui/brand-logo";
import { BackButton } from "@/components/ui/back-button";
import ColorChangeCards from "@/components/ui/color-change-card";
import { NextButton } from "@/components/ui/next-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Bell,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FilePlus2,
  FileText,
  Gauge,
  HelpCircle,
  Home,
  Layers3,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  PencilRuler,
  ReceiptText,
  Ruler,
  Send,
  User,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";

type IconType = ComponentType<{ className?: string }>;
type CustomerSection =
  | "dashboard"
  | "design"
  | "requests"
  | "messages"
  | "billing"
  | "documents"
  | "profile"
  | "notifications"
  | "support";

const houseImage = "/House/image.png";

const designOptions = [
  {
    name: "Modern Minimalist",
    style: "Modern",
    finish: "Standard",
    area: 150,
    rooms: "3 bedrooms, 2 toilets",
    rate: 40000,
    image: "/House/image.png",
    notes: "Clean layout for subdivision-ready residential builds.",
  },
  {
    name: "Contemporary Family",
    style: "Contemporary",
    finish: "Semi-luxury",
    area: 180,
    rooms: "4 bedrooms, 3 toilets",
    rate: 48000,
    image: "/House/Screenshot%202026-07-29%20003940.png",
    notes: "Balanced room sizes with stronger facade treatment.",
  },
  {
    name: "Compact Bungalow",
    style: "Bungalow",
    finish: "Standard",
    area: 120,
    rooms: "2 bedrooms, 2 toilets",
    rate: 35000,
    image: "/House/Screenshot%202026-07-29%20003957.png",
    notes: "Lower starting estimate for smaller lots and budgets.",
  },
];

const roofOptions = [
  { name: "Rib-type long span roofing", unit: "sqm", quantity: 95, unitPrice: 1450 },
  { name: "Pre-painted metal tile roofing", unit: "sqm", quantity: 95, unitPrice: 1850 },
  { name: "Stone-coated steel roofing", unit: "sqm", quantity: 95, unitPrice: 2400 },
];

const exteriorItemChoices = [
  {
    item: "Roof",
    detail: "Main roof material",
    quantityByArea: 0.63,
    options: roofOptions,
  },
  {
    item: "Exterior wall finish",
    detail: "Primer, skim coat, and weatherproof finish",
    quantityByArea: 1.4,
    options: [
      { name: "Standard exterior paint system", unit: "sqm", unitPrice: 520 },
      { name: "Elastomeric waterproof coating", unit: "sqm", unitPrice: 690 },
      { name: "Textured premium exterior finish", unit: "sqm", unitPrice: 860 },
    ],
  },
  {
    item: "Windows",
    detail: "Exterior window package",
    quantityByArea: 0.08,
    options: [
      { name: "Powder-coated aluminum windows", unit: "set", unitPrice: 11500 },
      { name: "Analok aluminum sliding windows", unit: "set", unitPrice: 13800 },
      { name: "uPVC awning windows", unit: "set", unitPrice: 16800 },
    ],
  },
  {
    item: "Main exterior door",
    detail: "Primary entry door",
    quantity: 1,
    options: [
      { name: "Steel panel entry door", unit: "set", unitPrice: 28000 },
      { name: "Solid wood entry door", unit: "set", unitPrice: 42000 },
      { name: "Aluminum glass entry door", unit: "set", unitPrice: 36000 },
    ],
  },
  {
    item: "Exterior accent cladding",
    detail: "Facade accent surface",
    quantityByArea: 0.16,
    options: [
      { name: "Ceramic facade tile accent", unit: "sqm", unitPrice: 1850 },
      { name: "Natural stone cladding", unit: "sqm", unitPrice: 3200 },
      { name: "Composite wood-look cladding", unit: "sqm", unitPrice: 2750 },
    ],
  },
  {
    item: "Gutter and downspout",
    detail: "Roof drainage line",
    quantityByArea: 0.28,
    options: [
      { name: "Pre-painted metal gutter", unit: "lm", unitPrice: 780 },
      { name: "PVC gutter system", unit: "lm", unitPrice: 620 },
      { name: "Seamless aluminum gutter", unit: "lm", unitPrice: 980 },
    ],
  },
  {
    item: "Exterior floor area",
    detail: "Porch, service area, and exterior landing",
    quantityByArea: 0.12,
    options: [
      { name: "Plain concrete exterior floor", unit: "sqm", unitPrice: 2200 },
      { name: "Non-slip exterior tiles", unit: "sqm", unitPrice: 3200 },
      { name: "Stamped concrete finish", unit: "sqm", unitPrice: 3800 },
    ],
  },
];

const customerNav: {
  label: string;
  icon: IconType;
  href: string;
  section: CustomerSection;
}[] = [
  { label: "Dashboard", icon: Gauge, href: "/customer", section: "dashboard" },
  { label: "My House Design", icon: Home, href: "/customer/house-design", section: "design" },
  { label: "Design Requests", icon: ClipboardList, href: "/customer/design-requests", section: "requests" },
  { label: "Messages", icon: Mail, href: "/customer/messages", section: "messages" },
  { label: "Billing Status", icon: ReceiptText, href: "/customer/billing", section: "billing" },
  { label: "Documents", icon: FileText, href: "/customer/documents", section: "documents" },
  { label: "My Profile", icon: UserRound, href: "/customer/profile", section: "profile" },
  { label: "Notifications", icon: Bell, href: "/customer/notifications", section: "notifications" },
  { label: "Support", icon: HelpCircle, href: "/customer/support", section: "support" },
];

const formatPeso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-200 p-6 text-center">
      <p className="text-sm font-semibold text-stone-950">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">{body}</p>
    </div>
  );
}

function ProjectExteriorEstimatePanel({
  design,
  selections,
  onSelectionChange,
}: {
  design: (typeof designOptions)[number];
  selections: number[];
  onSelectionChange: (itemIndex: number, optionIndex: number) => void;
}) {
  const baseEstimate = design.area * design.rate;
  const exteriorRows = exteriorItemChoices.map((item, itemIndex) => {
    const selectedOption = item.options[selections[itemIndex] ?? 0];
    const quantity =
      typeof item.quantity === "number"
        ? item.quantity
        : Math.max(1, Math.round(design.area * item.quantityByArea));
    const amount = quantity * selectedOption.unitPrice;

    return {
      ...item,
      selectedOption,
      quantity,
      amount,
    };
  });
  const exteriorTotal = exteriorRows.reduce(
    (total, material) => total + material.amount,
    0,
  );
  const revisedEstimate = baseEstimate + exteriorTotal;

  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {design.name} Exterior Materials & Pricing
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            These are the exterior items used on this selected project. Change
            any item option to preview how the estimated project price updates.
          </p>
        </div>
        <div className="grid gap-1 rounded-lg border border-stone-200 p-4 text-right">
          <p className="text-xs font-semibold uppercase text-stone-500">
            Revised Estimate
          </p>
          <p className="text-2xl font-semibold tracking-tight text-red-700">
            {formatPeso(revisedEstimate)}
          </p>
          <p className="text-xs text-stone-500">
            Base {formatPeso(baseEstimate)} + exterior {formatPeso(exteriorTotal)}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-stone-500">
              <th className="border-b border-stone-200 px-3 py-3">Exterior Item</th>
              <th className="border-b border-stone-200 px-3 py-3">Client Change Option</th>
              <th className="border-b border-stone-200 px-3 py-3">Unit</th>
              <th className="border-b border-stone-200 px-3 py-3 text-right">Quantity</th>
              <th className="border-b border-stone-200 px-3 py-3 text-right">Unit Price</th>
              <th className="border-b border-stone-200 px-3 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {exteriorRows.map((material, itemIndex) => (
                <tr key={material.item}>
                  <td className="border-b border-stone-100 px-3 py-4">
                    <p className="font-semibold text-stone-950">{material.item}</p>
                    <p className="mt-1 text-xs text-stone-500">{material.detail}</p>
                  </td>
                  <td className="border-b border-stone-100 px-3 py-4">
                    <select
                      value={selections[itemIndex] ?? 0}
                      onChange={(event) =>
                        onSelectionChange(itemIndex, Number(event.target.value))
                      }
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-600"
                      aria-label={`Change ${material.item}`}
                    >
                      {material.options.map((option, optionIndex) => (
                        <option key={option.name} value={optionIndex}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-stone-100 px-3 py-4 text-stone-600">
                    {material.selectedOption.unit}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-4 text-right font-medium">
                    {material.quantity}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-4 text-right">
                    {formatPeso(material.selectedOption.unitPrice)}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-4 text-right font-semibold text-stone-950">
                    {formatPeso(material.amount)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-900">
          This is an editable estimate preview for client-requested changes.
          Final pricing still needs G4 Builders Inc review before approval.
        </div>
        <div className="rounded-lg border border-stone-200 p-4 text-right">
          <p className="text-xs font-semibold uppercase text-stone-500">
            Exterior Subtotal
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-red-700">
            {formatPeso(exteriorTotal)}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function SidebarContent({
  activeSection,
  onNavigate,
}: {
  activeSection: CustomerSection;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-24 items-center border-b border-stone-200 px-5">
        <BrandLogo compact />
      </div>
      <nav className="flex-1 space-y-1 px-4 py-5">
        {customerNav.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className={[
              "flex items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium transition",
              item.section === activeSection
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

function CustomerShell({
  activeSection,
  title,
  description,
  children,
}: {
  activeSection: CustomerSection;
  title: string;
  description: string;
  children: ReactNode;
}) {
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
        <SidebarContent activeSection={activeSection} />
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
            <SidebarContent
              activeSection={activeSection}
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
                <p className="text-xl font-semibold tracking-tight text-stone-950">{title}</p>
                <p className="mt-1 text-sm text-stone-600">{description}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle
                isLightMode={isLightMode}
                onToggle={() => setIsLightMode((current) => !current)}
              />
              <Link
                href="/customer/notifications"
                className="relative grid h-10 w-10 place-items-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-700 text-xs font-semibold text-white">
                  3
                </span>
              </Link>
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

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function CustomerDashboard() {
  return (
    <CustomerShell
      activeSection="dashboard"
      title="Welcome back, John Doe"
      description="A quick view of your design, request status, and billing."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Panel className="relative min-h-[260px] overflow-hidden">
            <Image
              src={houseImage}
              alt="Modern house design"
              fill
              priority
              className="object-cover"
              sizes="(min-width: 1024px) 60vw, 100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/20" />
            <div className="relative max-w-md p-8">
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-stone-950">
                Your home planning workspace
              </h1>
              <p className="mt-4 text-sm leading-6 text-stone-600">
                Start with the essentials. Open each menu item for full details.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/customer/house-design"
                  className="rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800"
                >
                  View Design
                </Link>
                <Link
                  href="/customer/design-requests"
                  className="rounded-lg border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                >
                  New Request
                </Link>
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            <Panel className="p-5">
              <p className="text-sm text-stone-500">Current Design</p>
              <p className="mt-2 text-xl font-semibold">Not yet selected</p>
            </Panel>
            <Panel className="p-5">
              <p className="text-sm text-stone-500">Estimated Budget</p>
              <p className="mt-2 text-xl font-semibold text-red-700">PHP 0.00</p>
            </Panel>
            <Panel className="p-5">
              <p className="text-sm text-stone-500">Pending Requests</p>
              <p className="mt-2 text-xl font-semibold">0</p>
            </Panel>
          </div>

          <Panel className="p-5">
            <h2 className="text-lg font-semibold tracking-tight">Next Steps</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { title: "Compare house designs", href: "/customer/house-design", icon: Home },
                { title: "Send design revision", href: "/customer/design-requests", icon: FilePlus2 },
                { title: "Message the team", href: "/customer/messages", icon: MessageSquareText },
                { title: "Review billing status", href: "/customer/billing", icon: CreditCard },
              ].map((action) => (
                <Link
                  key={action.title}
                  href={action.href}
                  className="flex items-center gap-3 rounded-lg border border-stone-200 p-4 text-sm font-semibold hover:border-red-200 hover:bg-red-50"
                >
                  <action.icon className="h-5 w-5 text-red-700" />
                  {action.title}
                </Link>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel className="p-5">
            <h2 className="text-lg font-semibold tracking-tight">Billing Overview</h2>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <p className="text-stone-500">Total Contract Price</p>
                <p className="mt-1 text-2xl font-semibold text-red-700">PHP 0.00</p>
              </div>
              <div>
                <p className="text-stone-500">Balance Due</p>
                <p className="mt-1 text-xl font-semibold">PHP 0.00</p>
              </div>
            </div>
            <Link
              href="/customer/billing"
              className="mt-6 inline-flex w-full justify-center rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800"
            >
              View Billing Details
            </Link>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-lg font-semibold tracking-tight">Project Updates</h2>
            <EmptyState
              title="No updates yet."
              body="Updates will appear after a design request or project record is created."
            />
          </Panel>
        </div>
      </div>
    </CustomerShell>
  );
}

export function CustomerHouseDesignPage() {
  const [activeSlide, setActiveSlide] = useState<"designs" | "houseTypes">("designs");
  const [selectedDesignIndex, setSelectedDesignIndex] = useState<number | null>(null);
  const [materialSelections, setMaterialSelections] = useState(
    exteriorItemChoices.map(() => 0),
  );
  const selectedDesign =
    selectedDesignIndex === null ? null : designOptions[selectedDesignIndex];

  return (
    <CustomerShell
      activeSection="design"
      title="My House Design"
      description="Compare designs, finishes, floor area, and rough estimates."
    >
      <div className="space-y-6">
        <Panel className="p-5">
          {activeSlide === "designs" ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Compare House Designs</h1>
                  <p className="mt-1 text-sm text-stone-600">
                    Visual previews with starting cost per square meter.
                  </p>
                </div>
                <p className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-600">
                  Click a project to view editable exterior pricing
                </p>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {designOptions.map((design, index) => (
                  <button
                    key={design.name}
                    type="button"
                    onClick={() => {
                      setSelectedDesignIndex(index);
                      setMaterialSelections(exteriorItemChoices.map(() => 0));
                    }}
                    className={[
                      "overflow-hidden rounded-xl border bg-white text-left transition hover:border-red-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600",
                      selectedDesignIndex === index
                        ? "border-red-700 ring-2 ring-red-100"
                        : "border-stone-200",
                    ].join(" ")}
                    aria-label={`View exterior materials and estimate for ${design.name}`}
                  >
                    <div className="relative h-44">
                      <Image
                        src={design.image}
                        alt={`${design.name} visual preview`}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 25vw, 100vw"
                      />
                    </div>
                    <div className="p-4">
                      <h2 className="font-semibold tracking-tight">{design.name}</h2>
                      <p className="mt-1 text-xs text-stone-500">
                        {design.style} - {design.finish}
                      </p>
                      <p className="mt-3 text-sm leading-5 text-stone-600">{design.notes}</p>
                      <dl className="mt-4 grid gap-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-stone-500">Area</dt>
                          <dd className="font-semibold">{design.area} sqm</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-stone-500">Starts at</dt>
                          <dd className="font-semibold">{formatPeso(design.rate)} / sqm</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-stone-500">Estimated total</dt>
                          <dd className="font-semibold text-red-700">
                            {formatPeso(design.area * design.rate)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </button>
                ))}
              </div>

              {selectedDesign ? (
                <div className="mt-6">
                  <ProjectExteriorEstimatePanel
                    design={selectedDesign}
                    selections={materialSelections}
                    onSelectionChange={(itemIndex, optionIndex) =>
                      setMaterialSelections((current) =>
                        current.map((value, index) =>
                          index === itemIndex ? optionIndex : value,
                        ),
                      )
                    }
                  />
                </div>
              ) : (
                <div className="mt-6 rounded-lg border border-dashed border-stone-200 p-6 text-center">
                  <p className="text-sm font-semibold text-stone-950">
                    Select a project to view its exterior items and prices.
                  </p>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">
                    The editable estimate table will appear here after choosing
                    one of the project cards above.
                  </p>
                </div>
              )}

              <div className="mt-6 flex justify-end border-t border-stone-200 pt-5">
                <NextButton
                  type="button"
                  onClick={() => setActiveSlide("houseTypes")}
                />
              </div>
            </>
          ) : (
            <div>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Choose House Type</h1>
                  <p className="mt-1 text-sm text-stone-600">
                    Select one of six house styles for the next estimate preview.
                  </p>
                </div>
                <BackButton
                  type="button"
                  onClick={() => setActiveSlide("designs")}
                />
              </div>
              <ColorChangeCards />
            </div>
          )}
        </Panel>
      </div>
    </CustomerShell>
  );
}

export function CustomerDesignRequestsPage() {
  return (
    <CustomerShell
      activeSection="requests"
      title="Design Requests"
      description="Send room, floor area, material, and budget changes to the team."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="p-5">
          <h1 className="text-xl font-semibold tracking-tight">New Design Request</h1>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Ruler className="h-4 w-4 text-red-700" />
                Floor Area
              </span>
              <input className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600" defaultValue="150 sqm" />
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <PencilRuler className="h-4 w-4 text-red-700" />
                Rooms
              </span>
              <input className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-600" defaultValue="3 bedrooms, 2 toilets" />
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Layers3 className="h-4 w-4 text-red-700" />
                Finish Level
              </span>
              <select className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-600" defaultValue="Standard">
                <option>Standard</option>
                <option>Semi-luxury</option>
                <option>Luxury</option>
              </select>
            </label>
          </div>
          <textarea
            rows={6}
            placeholder="Describe requested revisions, preferred style, material expectations, or budget concerns."
            className="mt-5 w-full resize-none rounded-lg border border-stone-200 px-3 py-3 text-sm outline-none placeholder:text-stone-400 focus:border-red-600"
          />
          <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800">
            <Send className="h-4 w-4" />
            Submit Request
          </button>
        </Panel>
        <Panel className="p-5">
          <h2 className="text-lg font-semibold tracking-tight">Request History</h2>
          <div className="mt-4">
            <EmptyState title="No design requests yet." body="Submitted revisions and comments will appear here." />
          </div>
        </Panel>
      </div>
    </CustomerShell>
  );
}

export function CustomerBillingPage() {
  const stages = [
    { label: "Down payment", value: "15%", amount: "PHP 900K" },
    { label: "30% site progress", value: "25%", amount: "PHP 1.5M" },
    { label: "60% site progress", value: "30%", amount: "PHP 1.8M" },
    { label: "Completion", value: "30%", amount: "PHP 1.8M" },
  ];

  return (
    <CustomerShell
      activeSection="billing"
      title="Billing Status"
      description="Review progress billing and the status of your payments."
    >
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel className="p-5">
          <h1 className="text-lg font-semibold tracking-tight">Billing Summary</h1>
          <div className="mt-5 space-y-4 text-sm">
            <div>
              <p className="text-stone-500">Total Contract Price</p>
              <p className="mt-1 text-2xl font-semibold text-red-700">PHP 0.00</p>
            </div>
            <div>
              <p className="text-stone-500">Total Paid</p>
              <p className="mt-1 text-xl font-semibold">PHP 0.00</p>
            </div>
            <div>
              <p className="text-stone-500">Balance Due</p>
              <p className="mt-1 text-xl font-semibold">PHP 0.00</p>
            </div>
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="text-lg font-semibold tracking-tight">Progress Billing Preview</h2>
          <p className="mt-2 text-sm text-stone-600">
            Sample only. Payment status is based on approved site accomplishment
            and verified billing records.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {stages.map((stage) => (
              <div key={stage.label} className="rounded-lg border border-stone-200 p-4">
                <div className="flex justify-between gap-3 text-sm">
                  <p className="font-semibold">{stage.label}</p>
                  <p className="text-red-700">{stage.value}</p>
                </div>
                <p className="mt-2 text-sm text-stone-500">{stage.amount}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </CustomerShell>
  );
}

export function CustomerDocumentsPage() {
  return (
    <CustomerShell activeSection="documents" title="Documents" description="View files, plans, estimates, and approvals.">
      <Panel className="p-5">
        <h1 className="text-xl font-semibold tracking-tight">Project Documents</h1>
        <div className="mt-5">
          <EmptyState title="No documents uploaded yet." body="Blueprints, estimates, approvals, invoices, and reports will appear here." />
        </div>
      </Panel>
    </CustomerShell>
  );
}

export function CustomerProfilePage() {
  return (
    <CustomerShell activeSection="profile" title="My Profile" description="Manage customer account details.">
      <Panel className="max-w-2xl p-5">
        <h1 className="text-xl font-semibold tracking-tight">Profile Details</h1>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Name</span>
            <input className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" defaultValue="John Doe" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Role</span>
            <input className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" defaultValue="Customer" />
          </label>
        </div>
      </Panel>
    </CustomerShell>
  );
}

export function CustomerNotificationsPage() {
  return (
    <CustomerShell activeSection="notifications" title="Notifications" description="Recent reminders and system updates.">
      <Panel className="p-5">
        <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
        <div className="mt-5 space-y-3">
          {["Design estimate pending review", "No billing due today", "Message center is ready"].map((item) => (
            <div key={item} className="rounded-lg border border-stone-200 p-4 text-sm text-stone-600">
              {item}
            </div>
          ))}
        </div>
      </Panel>
    </CustomerShell>
  );
}

export function CustomerSupportPage() {
  return (
    <CustomerShell activeSection="support" title="Support" description="Ask for help with design, estimates, billing, or documents.">
      <Panel className="max-w-3xl p-5">
        <h1 className="text-xl font-semibold tracking-tight">Contact Support</h1>
        <textarea
          rows={6}
          placeholder="Write your question or concern here."
          className="mt-5 w-full resize-none rounded-lg border border-stone-200 px-3 py-3 text-sm outline-none placeholder:text-stone-400 focus:border-red-600"
        />
        <button className="mt-4 rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800">
          Send Support Request
        </button>
      </Panel>
    </CustomerShell>
  );
}
