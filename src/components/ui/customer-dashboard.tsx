"use client";

import { BrandLogo } from "@/components/ui/brand-logo";
import { BackButton } from "@/components/ui/back-button";
import ColorChangeCards from "@/components/ui/color-change-card";
import {
  createDefaultSelections,
  formatPeso,
  getExteriorEstimate,
  isDataImage,
  normalizeSelections,
  type HouseDesign,
} from "@/components/ui/house-design-data";
import { HouseDesignGallery } from "@/components/ui/house-design-gallery";
import { ProjectExteriorEstimatePanel } from "@/components/ui/project-exterior-estimate-panel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useHouseDesigns } from "@/lib/house-design-store";
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

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
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
              <ThemeToggle />
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
  const { designs } = useHouseDesigns();
  const [activeStep, setActiveStep] = useState<"types" | "designs" | "details">("types");
  const [selectedHouseType, setSelectedHouseType] = useState<string | null>(null);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [materialSelections, setMaterialSelections] = useState(
    createDefaultSelections,
  );
  const publishedDesigns = designs.filter(
    (design) => design.status === "Published",
  );
  const filteredDesigns = selectedHouseType
    ? publishedDesigns.filter((design) => design.houseType === selectedHouseType)
    : [];
  const selectedDesign =
    publishedDesigns.find((design) => design.id === selectedDesignId) ?? null;

  const openDesign = (design: HouseDesign) => {
    setSelectedDesignId(design.id);
    setMaterialSelections(normalizeSelections(design.defaultSelections));
    setActiveStep("details");
  };

  return (
    <CustomerShell
      activeSection="design"
      title="My House Design"
      description="Select a house type, choose a design, review details, and edit exterior materials."
    >
      <div className="space-y-6">
        <Panel className="p-5">
          {activeStep === "types" ? (
            <div>
              <div className="mb-5">
                <h1 className="text-xl font-semibold tracking-tight">Select House Type</h1>
                <p className="mt-1 text-sm text-stone-600">
                  Start by choosing a house type. Design images appear after a type is selected.
                </p>
              </div>
              <ColorChangeCards
                onSelect={(houseType) => {
                  setSelectedHouseType(houseType);
                  setSelectedDesignId(null);
                  setActiveStep("designs");
                }}
              />
            </div>
          ) : activeStep === "designs" ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">
                    {selectedHouseType} House Designs
                  </h1>
                  <p className="mt-1 text-sm text-stone-600">
                    Select one house design to view project details and estimated construction cost.
                  </p>
                </div>
                <BackButton type="button" onClick={() => setActiveStep("types")} />
              </div>

              {filteredDesigns.length > 0 ? (
                <div className="mt-5 columns-1 gap-4 sm:columns-2 xl:columns-3">
                  {filteredDesigns.map((design, designIndex) => (
                    <button
                      key={design.id}
                      type="button"
                      onClick={() => openDesign(design)}
                      className="mb-4 inline-block w-full break-inside-avoid overflow-hidden rounded-xl bg-white text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600"
                      aria-label={`View project details for ${design.name}`}
                    >
                      <div
                        className={[
                          "relative overflow-hidden rounded-xl bg-stone-100",
                          designIndex % 3 === 0
                            ? "h-56"
                            : designIndex % 3 === 1
                              ? "h-72"
                              : "h-48",
                        ].join(" ")}
                      >
                        {design.images[0] ? (
                          <Image
                            src={design.images[0]}
                            alt={`${design.name} visual preview`}
                            fill
                            unoptimized={isDataImage(design.images[0])}
                            className="object-cover"
                            sizes="(min-width: 1024px) 25vw, 100vw"
                          />
                        ) : null}
                        {design.images.length > 1 ? (
                          <span className="absolute bottom-2 right-2 rounded-md bg-stone-950/70 px-2 py-0.5 text-xs font-semibold text-white">
                            {design.images.length} photos
                          </span>
                        ) : null}
                      </div>
                      <div className="px-1 py-3">
                        <h2 className="text-sm font-semibold tracking-tight text-stone-950">
                          {design.name}
                        </h2>
                        <p className="mt-1 text-xs text-stone-600">
                          {design.style ?? design.houseType} - {design.area} sqm
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-lg border border-dashed border-stone-200 p-6 text-center">
                  <p className="text-sm font-semibold text-stone-950">
                    No designs available for this house type yet.
                  </p>
                </div>
              )}
            </>
          ) : selectedDesign ? (
            <div>
              <div className="mb-5 flex justify-start">
                <BackButton type="button" onClick={() => setActiveStep("designs")} />
              </div>

              <HouseDesignGallery
                images={selectedDesign.images}
                name={selectedDesign.name}
              />

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
                    {selectedDesign.name}
                  </h1>
                  <p className="mt-1 text-sm text-stone-600">
                    {selectedDesign.notes}
                  </p>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-lg border border-stone-200 p-4">
                      <dt className="text-xs font-semibold uppercase text-stone-500">
                        House Type
                      </dt>
                      <dd className="mt-1 font-semibold text-stone-950">
                        {selectedDesign.houseType}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-4">
                      <dt className="text-xs font-semibold uppercase text-stone-500">
                        Floor Area
                      </dt>
                      <dd className="mt-1 font-semibold text-stone-950">
                        {selectedDesign.area} sqm
                      </dd>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-4">
                      <dt className="text-xs font-semibold uppercase text-stone-500">
                        Rooms
                      </dt>
                      <dd className="mt-1 font-semibold text-stone-950">
                        {selectedDesign.rooms}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-5 text-right shadow-sm">
                  <p className="text-sm font-semibold text-stone-500">
                    Estimated Project Cost
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-red-700">
                    {formatPeso(
                      getExteriorEstimate(selectedDesign, materialSelections)
                        .revisedEstimate,
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <ProjectExteriorEstimatePanel
                  design={selectedDesign}
                  selections={materialSelections}
                />
              </div>

              <div className="mt-6 flex justify-end border-t border-stone-200 pt-5">
                <Link href="/customer/design-requests" className="rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800">Request Material Changes</Link>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-stone-200 p-6 text-center">
              <p className="text-sm font-semibold text-stone-950">
                Select a house type to begin.
              </p>
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



