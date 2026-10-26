"use client";

import { AccountTermsGate } from "@/components/customer/account-terms-gate";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ClientInformationReminder, ClientProfileForm } from "@/components/clients/client-profile";
import { MobileNavigation } from "@/components/ui/mobile-navigation";
import { BackButton } from "@/components/ui/back-button";
import HouseTypeCards, { HouseTypeCard, houseTypeGridClass } from "@/components/house-designs/house-type-cards";
import {
  formatPeso,
  getDesignEstimate,
  isDataImage,
  type HouseDesign,
} from "@/lib/house-design-data";
import { HouseDesignGallery } from "@/components/house-designs/house-design-gallery";
import { useDesignNavigation } from "@/lib/use-design-navigation";
import { HouseDesignSpecs } from "@/components/house-designs/house-design-specs";
import { CustomerDesignRequests } from "@/components/customer/customer-design-requests";
import { CustomerDreamHouse } from "@/components/customer/customer-dream-house";
import { CustomerNotificationBell } from "@/components/customer/customer-notification-bell";
import { AccountMenu, type AccountMenuLink } from "@/components/ui/account-menu";
import { useHouseDesigns } from "@/lib/house-design-store";
import { useSessionUser } from "@/lib/session-store";
import { useCustomerDashboardData } from "@/lib/customer-dashboard-data";
import { CustomerSchedule } from "@/components/customer/customer-schedule";
import {
  CalendarDays,
  ClipboardList,
  Gauge,
  Home,
  Menu,
  ReceiptText,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";

type IconType = ComponentType<{ className?: string }>;
type CustomerSection =
  | "dashboard"
  | "dream-house"
  | "requests"
  | "billing"
  | "schedule"
  | "profile";

const houseImage = "/House/image.png";

const customerNav: {
  label: string;
  icon: IconType;
  href: string;
  section: CustomerSection;
}[] = [
  { label: "Dashboard", icon: Gauge, href: "/customer", section: "dashboard" },
  { label: "Dream House", icon: Home, href: "/customer/dream-house", section: "dream-house" },
  { label: "Design Requests", icon: ClipboardList, href: "/customer/design-requests", section: "requests" },
  { label: "Billing Status", icon: ReceiptText, href: "/customer/billing", section: "billing" },
  { label: "My Schedule", icon: CalendarDays, href: "/customer/schedule", section: "schedule" },
];

const customerAccountLinks: AccountMenuLink[] = [
  { label: "My Profile", icon: UserRound, href: "/customer/profile" },
];

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}>
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
      <div className={`flex h-24 shrink-0 items-center border-b border-stone-200 px-5 ${onNavigate ? "pr-16" : ""}`}>
        <BrandLogo compact />
      </div>
      <nav aria-label="Customer navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-5">
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
  const { user } = useSessionUser();

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <SidebarContent activeSection={activeSection} />
      </aside>

      <MobileNavigation open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SidebarContent activeSection={activeSection} onNavigate={() => setIsSidebarOpen(false)} />
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
                <p className="text-base font-semibold tracking-tight break-words text-stone-950 sm:text-xl">{title}</p>
                <p className="mt-1 hidden text-sm text-stone-600 sm:block">{description}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <CustomerNotificationBell />
              <AccountMenu name={user?.name ?? "Customer"} role="Customer" links={customerAccountLinks} />
            </div>
            <p className="col-span-2 text-xs leading-5 text-stone-600 sm:hidden">{description}</p>
          </div>
        </header>

        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        {user ? <AccountTermsGate userId={user.id} /> : null}
      </div>
    </div>
  );
}

export function CustomerDashboard() {
  const { user } = useSessionUser();
  const dashboard = useCustomerDashboardData();
  return (
    <CustomerShell
      activeSection="dashboard"
      title={user ? `Welcome back, ${user.name}` : "Welcome back"}
      description="A quick view of your design, request status, and billing."
    >
      <ClientInformationReminder />
      {dashboard.error ? (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {dashboard.error}
        </p>
      ) : null}
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
                Your Home Planning Workspace
              </h1>
              <p className="mt-4 text-sm leading-6 text-stone-600">
                Start with the essentials. Open each menu item for full details.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/customer/dream-house"
                  className="rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800"
                >
                  Dream House
                </Link>
                <Link
                  href="/customer/design-requests"
                  className="rounded-lg border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                >
                  New Request
                </Link>
                <Link href="/customer/finished-designs" className="rounded-lg border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-700 hover:bg-rose-50">View Finished Designs</Link>
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            <Panel className="p-5">
              <p className="text-sm text-stone-500">Latest Design Request</p>
              <p className="mt-2 text-xl font-semibold">
                {dashboard.currentDesign ?? "No request yet"}
              </p>
            </Panel>
            <Panel className="p-5">
              <p className="text-sm text-stone-500">Estimated Budget</p>
              <p className="mt-2 text-xl font-semibold text-red-700">
                {formatPeso(dashboard.estimatedBudget)}
              </p>
            </Panel>
            <Panel className="p-5">
              <p className="text-sm text-stone-500">Pending Requests</p>
              <p className="mt-2 text-xl font-semibold">{dashboard.pendingRequests}</p>
            </Panel>
          </div>
        </div>

        <div className="space-y-6">
          <Panel className="p-5">
            <h2 className="text-lg font-semibold tracking-tight">Billing Overview</h2>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <p className="text-stone-500">Total Contract Price</p>
                <p className="mt-1 text-2xl font-semibold text-red-700">
                  {formatPeso(dashboard.totalContractPrice)}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Balance Due</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatPeso(dashboard.balanceDue)}
                </p>
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
            {dashboard.notifications.length > 0 ? (
              <div className="mt-4 space-y-3">
                {dashboard.notifications.slice(0, 3).map((notification) => (
                  <div key={notification.id} className="rounded-lg border border-stone-200 p-4">
                    <p className="text-sm font-semibold">{notification.title}</p>
                    <p className="mt-1 text-sm text-stone-600">{notification.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No updates yet."
                body="Updates will appear after a design request or project record is created."
              />
            )}
          </Panel>
        </div>
      </div>
    </CustomerShell>
  );
}

export function CustomerDreamHousePage({ designId, designRequestId, estimateId }: { designId?: string; designRequestId?: string; estimateId?: string }) {
  return (
    <CustomerShell activeSection="dream-house" title="Dream House" description="Review your design for free, pay for the blueprint, then build with us if you want to.">
      <CustomerDreamHouse designId={designId} designRequestId={designRequestId} estimateId={estimateId} />
    </CustomerShell>
  );
}

export function CustomerFinishedDesignsPage() {
  return (
    <CustomerShell
      activeSection="dashboard"
      title="Finished Designs"
      description="Explore published G4 Builders designs for inspiration before submitting your own request."
    >
      <Link href="/customer" className="mb-5 inline-flex text-sm font-semibold text-red-700 hover:underline">← Back to Dashboard</Link>
      {/* The account's Terms and Conditions agreement lets the server return full galleries. */}
      <FinishedDesignsBrowser />
    </CustomerShell>
  );
}

function FinishedDesignsBrowser() {
  const { designs, catalog, isLoading, error } = useHouseDesigns();
  const [activeStep, setActiveStep] = useState<"types" | "designs" | "details">("types");
  const [selectedHouseType, setSelectedHouseType] = useState<string | null>(null);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const publishedDesigns = designs.filter(
    (design) => design.status === "Published",
  );
  // `null` type with the designs step open lists published designs that have no house type yet.
  const untypedDesigns = publishedDesigns.filter((design) => !design.houseType);
  const filteredDesigns = selectedHouseType
    ? publishedDesigns.filter((design) => design.houseType === selectedHouseType)
    : untypedDesigns;
  const selectedDesign =
    publishedDesigns.find((design) => design.id === selectedDesignId) ?? null;

  const openDesign = (design: HouseDesign) => {
    setSelectedDesignId(design.id);
    setActiveStep("details");
  };
  // Arrow keys and clicks on the photo's sides move through the designs of the open house type.
  const designNavigation = useDesignNavigation(
    activeStep === "details" && selectedDesign ? filteredDesigns : [],
    selectedDesign?.id ?? "",
    openDesign,
  );

  return (
      <div className="space-y-6">
        <Panel className="p-5">
          {error ? (
            <p role="alert" className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {isLoading ? (
            <p className="mb-5 text-sm text-stone-500">
              Loading house-design records from MongoDB…
            </p>
          ) : null}
          {activeStep === "types" ? (
            <div>
              <div className="mb-5">
                <h1 className="text-xl font-semibold tracking-tight">Select House Type</h1>
                <p className="mt-1 text-sm text-stone-600">
                  Start by choosing a house type. Design images appear after a type is selected.
                </p>
              </div>
              <HouseTypeCards
                houseTypes={catalog.houseTypes}
                onSelect={(houseType) => {
                  setSelectedHouseType(houseType);
                  setSelectedDesignId(null);
                  setActiveStep("designs");
                }}
              />
              {untypedDesigns.length > 0 ? (
                <div className={`mt-4 ${houseTypeGridClass}`}>
                  <HouseTypeCard
                    heading="Other Designs"
                    description="More finished designs from G4 Builders Inc that are not under a house type yet."
                    imgSrc={untypedDesigns[0].images[0] ?? ""}
                    ariaLabel="Choose other house designs"
                    onSelect={() => {
                      setSelectedHouseType(null);
                      setSelectedDesignId(null);
                      setActiveStep("designs");
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : activeStep === "designs" ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">
                    {selectedHouseType ? `${selectedHouseType} House Designs` : "Other Designs"}
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
                          {design.style || design.houseType ? `${design.style || design.houseType} - ` : ""}{design.area} sqm
                          {design.finish ? ` · ${design.finish} finish` : ""}
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
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <BackButton type="button" onClick={() => setActiveStep("designs")} />
              </div>

              <HouseDesignGallery
                key={selectedDesign.id}
                navigation={designNavigation}
                images={selectedDesign.images}
                name={selectedDesign.name}
                protectedView
              />

              <div className="mt-5">
                <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
                  {selectedDesign.name}
                </h1>
                <p className="mt-1 text-sm text-stone-600">
                  {selectedDesign.notes}
                </p>
                <HouseDesignSpecs design={selectedDesign} className="mt-4" />
              </div>

              <div className="mt-6 flex flex-col gap-4 border-t border-stone-200 pt-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-500">
                    Total Estimated Price
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-red-700">
                    {formatPeso(getDesignEstimate(selectedDesign).estimate)}
                  </p>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
                    Request this design as shown, or suggest the materials and items you prefer.
                    Reviewing the design and its cost estimate is free; only the blueprint is billed.
                  </p>
                </div>
                <Link href={`/customer/design-requests?design=${encodeURIComponent(selectedDesign.id)}`} className="inline-flex shrink-0 justify-center rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600">Request This Design</Link>
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
  );
}
export function CustomerDesignRequestsPage({ houseDesignId }: { houseDesignId?: string }) {
  return (
    <CustomerShell
      activeSection="requests"
      title="Design Requests"
      description="Submit your requirements for admin approval and track the design work. Delivered designs continue in Dream House."
    >
      <CustomerDesignRequests key={houseDesignId ?? "custom"} houseDesignId={houseDesignId} />
    </CustomerShell>
  );
}

export function CustomerBillingPage() {
  return <CustomerShell activeSection="billing" title="Billing & Payments" description="View invoices, submit payment details, and download your receipts."><BillingWorkspace customer section="Invoices" /></CustomerShell>;
}

export function CustomerSchedulePage() {
  return <CustomerShell activeSection="schedule" title="My Schedule" description="See your meetings and payment due dates, and request a meeting with the team."><CustomerSchedule /></CustomerShell>;
}

export function CustomerProfilePage() {
  return (
    <CustomerShell activeSection="profile" title="My Profile" description="Manage customer account details.">
      <Panel className="max-w-3xl p-4 sm:p-6">
        <h1 className="text-xl font-semibold tracking-tight">Profile Details</h1>
        <div className="mt-5"><ClientProfileForm /></div>
      </Panel>
    </CustomerShell>
  );
}
