"use client";

import { DesignWatermark } from "@/components/ui/design-watermark";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Building2,
  Calculator,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountTermsDialog } from "@/components/auth/account-terms";
import { PublicHeader } from "@/components/landing/public-header";
import { BrandLogo } from "@/components/ui/brand-logo";
import type { HomeSlide } from "@/lib/home-slideshow";

type StatProps = {
  label: string;
  value: string;
};

const Stat = ({ label, value }: StatProps) => (
  <div className="space-y-1">
    <div className="text-3xl font-semibold tracking-tight text-stone-950">
      {value}
    </div>
    <div className="text-sm text-stone-500">{label}</div>
  </div>
);

function MiniBars() {
  return (
    <div className="mt-6 flex h-36 items-end gap-4 rounded-xl bg-gradient-to-b from-rose-50 to-white p-4">
      {[22, 54, 78, 104].map((height, index) => (
        <motion.div
          key={height}
          initial={{ height: 0, opacity: 0.7 }}
          animate={{ height }}
          transition={{ delay: 0.45 + index * 0.15, type: "spring" }}
          className="w-10 rounded-xl bg-gradient-to-t from-rose-200 to-rose-400 shadow-inner"
        />
      ))}
    </div>
  );
}

function BlueprintMark() {
  return (
    <motion.div
      initial={{ rotate: -6, scale: 0.96 }}
      animate={{ rotate: 0, scale: 1 }}
      transition={{ duration: 1.8, type: "spring" }}
      className="grid h-52 w-52 place-items-center rounded-full border border-white/40 bg-white/10"
    >
      <div className="grid h-32 w-32 place-items-center rounded-2xl bg-white/20 shadow-2xl ring-1 ring-white/30">
        <Building2 className="h-16 w-16 text-white" strokeWidth={1.5} />
      </div>
    </motion.div>
  );
}

/** The designs the Admin picked in Maintenance (or the newest Published ones), one cover photo each. */
function SwappingHouseShowcase() {
  const [slides, setSlides] = useState<HomeSlide[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const slideCount = slides?.length ?? 0;

  useEffect(() => {
    let active = true;
    fetch("/api/settings/home-slideshow", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ slides: HomeSlide[] }>) : { slides: [] }))
      .then((payload) => {
        if (active) setSlides(payload.slides);
      })
      .catch(() => {
        if (active) setSlides([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (slideCount < 2) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slideCount);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [slideCount]);

  const activeSlide = slides?.[activeIndex % slideCount];

  if (!activeSlide) {
    return (
      <div className="grid aspect-[1.42/1] place-items-center rounded-xl border border-dashed border-stone-200 bg-stone-50 text-sm text-stone-500">
        {slides ? "No published designs yet." : "Loading published designs…"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        key={activeSlide.designId}
        initial={{ opacity: 0.35, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45 }}
        className="relative aspect-[1.42/1] overflow-hidden rounded-xl bg-stone-200 shadow-lg ring-1 ring-stone-200"
        onContextMenu={(event) => event.preventDefault()}
      >
        <DesignWatermark />
        <div
          className="h-full w-full bg-cover bg-center"
          style={{
            backgroundImage: `url(${activeSlide.image})`,
          }}
          aria-label={activeSlide.name}
          role="img"
        />
      </motion.div>

      <div className="grid grid-cols-4 gap-2">
        {slides.map((slide, index) => (
          <button
            key={slide.designId}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={[
              "aspect-[1.42/1] overflow-hidden rounded-lg border bg-stone-100 transition",
              activeIndex === index
                ? "border-red-700 ring-2 ring-red-700/20"
                : "border-stone-200 hover:border-stone-300",
            ].join(" ")}
            aria-label={`Show ${slide.name}`}
          >
            <span
              className="block h-full w-full bg-cover bg-center"
              style={{
                backgroundImage: `url(${slide.image})`,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Footer with the brand and a working link to the Terms and Conditions; the site has no other public pages. */
function LandingFooter() {
  const [readingTerms, setReadingTerms] = useState(false);
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto w-full max-w-[1244px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <BrandLogo />
          <p className="mt-6 text-sm leading-7 text-stone-600">
            G4 Builders Inc helps project teams estimate construction costs,
            review BOQ items, manage progress billing, and keep project reports
            clear from site work to office approvals.
          </p>
        </div>
        {/* Kept on the left: the floating Contact Us button covers the bottom-right corner. */}
        <div className="mt-10 flex flex-col items-start gap-3 border-t border-stone-200 pt-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:gap-6">
          <p>Copyright {new Date().getFullYear()} G4 Builders Inc. All rights reserved.</p>
          <button type="button" onClick={() => setReadingTerms(true)} aria-haspopup="dialog" className="rounded text-xs font-medium text-stone-600 underline-offset-4 transition hover:text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-red-600">
            Terms and Conditions
          </button>
        </div>
      </div>
      {readingTerms && <AccountTermsDialog onClose={() => setReadingTerms(false)} />}
    </footer>
  );
}

export default function LandingPage() {
  const [stats, setStats] = useState({
    activeProjects: 0,
    publishedDesigns: 0,
    completedProjects: 0,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/public/stats", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload) setStats(payload);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-white text-stone-950">
      <PublicHeader />

      <main className="mx-auto grid w-full max-w-[1244px] grid-cols-1 gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-10 lg:px-8">
        <section className="flex min-w-0 flex-col justify-center space-y-6 sm:space-y-8">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">
              Build costs
              <br />
              with control.
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-stone-600">
              A construction cost estimation and billing workspace for G4
              Builders Inc, built to keep quantities, approvals, invoices, and
              project margins aligned.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 sm:max-w-sm sm:gap-8">
            <Stat label="Published Designs" value={String(stats.publishedDesigns)} />
            <Stat label="Active Projects" value={String(stats.activeProjects)} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-5 opacity-75">
            <span className="text-xs text-stone-500">BUILT FOR SITE TEAMS</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-stone-400">
              <span>BOQ</span>
              <span>Progress Billing</span>
              <span>Cost Tracking</span>
            </div>
          </div>
        </section>

        <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative col-span-1 overflow-hidden rounded-xl bg-gradient-to-b from-red-950 to-red-800 p-6 text-red-50 shadow-lg"
          >
            <div className="relative flex min-h-64 flex-col justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-600/60 p-2 ring-1 ring-white/10">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="text-xs uppercase tracking-wider text-red-100">
                  Controlled Billing
                </span>
              </div>
              <div className="mt-6 text-xl leading-snug text-red-50/95">
                Review every
                <br /> variation before release
              </div>
              <motion.div
                className="absolute right-6 top-6 h-12 w-12 rounded-full bg-red-500/40"
                animate={{
                  boxShadow: [
                    "0 0 0 0 rgba(248,113,113,0.35)",
                    "0 0 0 16px rgba(248,113,113,0)",
                  ],
                }}
                transition={{ duration: 2.5, repeat: Infinity }}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative col-span-1 overflow-hidden rounded-xl bg-gradient-to-b from-rose-600 to-rose-400 p-6 text-white shadow-lg"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 opacity-80">
              <BlueprintMark />
            </div>
            <div className="relative mt-28 text-sm text-white/90">
              Project Dashboard
            </div>
            <div className="relative text-xl font-medium leading-snug">
              Estimate, bill,
              <br /> and report in one place
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="col-span-1 rounded-xl bg-white p-6 text-stone-800 shadow-lg ring-1 ring-stone-200"
          >
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Calculator className="h-4 w-4" />
              Completed Projects
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">
              {stats.completedProjects}{" "}
              <span className="align-middle text-sm font-medium text-stone-400">
                 recorded
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-red-500">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Live project updates
            </div>
            <MiniBars />
          </motion.div>

          <div className="hidden sm:block" />
        </section>
      </main>

      <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto grid w-full max-w-[1244px] grid-cols-1 items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10 lg:px-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700">
              Better every project
            </p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-[1.1] tracking-tight text-stone-950 sm:text-4xl lg:text-5xl">
              See costs move before they become problems.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Rotate through site progress, material planning, billing reviews,
              and office coordination in one visual workspace for G4 Builders
              Inc.
            </p>
            <div className="mt-8">
              {/* Projects are viewed after signing in. */}
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
              >
                Review Projects <ArrowUpRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>

          <SwappingHouseShowcase />
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
