"use client";

import { ContactDetails } from "@/components/landing/contact-us";
import { BackButton } from "@/components/ui/back-button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useContactDetails } from "@/lib/use-contact-details";
import { Calculator, FileText, HardHat, House, type LucideIcon } from "lucide-react";
import Link from "next/link";

const services: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: House, title: "House Design", text: "Custom house designs and floor plans based on your requirements, or one of our published designs." },
  { icon: Calculator, title: "Construction Cost Estimates", text: "An itemized estimate with quantities and a payment schedule, free to review before you commit." },
  { icon: FileText, title: "Blueprints", text: "Complete plans prepared once you approve your design and accept the estimate." },
  { icon: HardHat, title: "Construction", text: "We build your house and bill by stage, so you pay as the work progresses." },
];

const steps = [
  "Send a design request with your floor area, rooms, and preferred style.",
  "Review the design and floor plan, and ask for changes until it is right.",
  "Get your construction cost estimate and accept it when you are ready.",
  "Pay for the blueprint and the downpayment, then pay by stage as the house goes up.",
];

export function AboutUsPage() {
  const contact = useContactDetails(true);

  return (
    <div className="min-h-screen bg-white text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur">
        <nav aria-label="Account navigation" className="mx-auto flex min-h-20 w-full max-w-[1244px] items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 lg:px-8">
          <Link href="/" aria-label="G4 Builders home" className="min-w-0">
            <BrandLogo />
          </Link>
          <BackButton href="/" />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Architects · Engineers · Designers · Contractor</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">About G4 Builders Incorporated</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
          G4 Builders Incorporated is a team of architects, engineers, designers, and contractors. We take your house
          from the first design to the finished build, with clear costs and billing at every stage.
        </p>

        <section aria-labelledby="about-services" className="mt-10">
          <h2 id="about-services" className="text-lg font-semibold tracking-tight">What We Do</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {services.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-xl border border-stone-200 p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-stone-950">{title}</span>
                  <span className="mt-1 block text-sm leading-6 text-stone-600">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-steps" className="mt-10">
          <h2 id="about-steps" className="text-lg font-semibold tracking-tight">How It Works</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-6 text-stone-600 sm:text-base sm:leading-7">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-700 text-xs font-semibold text-white">{index + 1}</span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/register"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Create a Client Account
          </Link>
        </section>

        <section aria-labelledby="about-contact" className="mt-10 max-w-md">
          <h2 id="about-contact" className="mb-4 text-lg font-semibold tracking-tight">Visit or Contact Us</h2>
          <ContactDetails contact={contact} />
        </section>
      </main>
    </div>
  );
}
