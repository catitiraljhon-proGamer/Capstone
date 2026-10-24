"use client";

import { DesignWatermark } from "@/components/ui/design-watermark";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountTermsDialog } from "@/components/auth/account-terms";
import { aboutUsServiceIcons } from "@/components/landing/about-us-services";
import { PublicHeader } from "@/components/landing/public-header";
import { BrandLogo } from "@/components/ui/brand-logo";
import type { AboutUsContent } from "@/lib/about-us";
import type { HomeSlide } from "@/lib/home-slideshow";

/** Card colors by position, alternating the dark red panel, the rose accent, and a white surface. */
const serviceCardStyles = [
  { card: "bg-gradient-to-b from-red-950 to-red-800 text-red-50", icon: "bg-red-600/60 ring-1 ring-white/10", text: "text-red-100" },
  { card: "bg-gradient-to-b from-rose-600 to-rose-400 text-white", icon: "bg-white/20 ring-1 ring-white/30", text: "text-white/90" },
  { card: "bg-white text-stone-950 ring-1 ring-stone-200", icon: "bg-rose-50 text-red-700", text: "text-stone-600" },
  { card: "bg-gradient-to-b from-red-950 to-red-800 text-red-50", icon: "bg-red-600/60 ring-1 ring-white/10", text: "text-red-100" },
];

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

/** Footer with the brand and a working link to the Terms and Conditions. */
function LandingFooter() {
  const [readingTerms, setReadingTerms] = useState(false);
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto w-full max-w-[1244px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <BrandLogo />
          <p className="mt-6 text-sm leading-7 text-stone-600">
            G4 Builders Incorporated designs and builds houses, from house
            design and construction cost estimates to blueprints and
            construction, with clear costs at every stage.
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

/**
 * The public home page shows the services G4 offers, never system details or live record counts. The tagline and the
 * What We Do items come from Maintenance > About Us, so the Admin edits them in one place.
 */
export default function LandingPage({ content }: { content: AboutUsContent }) {
  return (
    <div className="min-h-screen w-full bg-white text-stone-950">
      <PublicHeader />

      <main className="mx-auto grid w-full max-w-[1244px] grid-cols-1 gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-10 lg:px-8">
        <section className="flex min-w-0 flex-col justify-center space-y-6 sm:space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{content.tagline}</p>
            <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">
              Your house, from design to finished build.
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-stone-600">
              Choose one of our house designs or request your own. Get an
              itemized cost estimate, then build with G4 Builders and pay by
              stage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
            >
              Request a Design <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#designs"
              className="inline-flex items-center justify-center rounded-full border border-stone-200 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
            >
              View Our Designs
            </a>
          </div>
        </section>

        <section aria-labelledby="home-services" className="min-w-0">
          <h2 id="home-services" className="sr-only">What We Do</h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            {content.services.map((service, index) => {
              const Icon = aboutUsServiceIcons[index];
              const style = serviceCardStyles[index % serviceCardStyles.length];
              return (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * (index + 1) }}
                  className={`flex min-h-48 flex-col rounded-xl p-6 shadow-lg ${style.card}`}
                >
                  <span className={`grid h-10 w-10 place-items-center rounded-full ${style.icon}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-auto pt-8 text-xl font-semibold leading-snug tracking-tight">{service.title}</h3>
                  <p className={`mt-2 text-sm leading-6 ${style.text}`}>{service.text}</p>
                </motion.li>
              );
            })}
          </ul>
        </section>
      </main>

      <section id="designs" className="scroll-mt-24 border-y border-stone-200 bg-white">
        <div className="mx-auto grid w-full max-w-[1244px] grid-cols-1 items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10 lg:px-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700">
              Our House Designs
            </p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-[1.1] tracking-tight text-stone-950 sm:text-4xl lg:text-5xl">
              Find a design you like, or ask for your own.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Browse some of our house designs. Create an account to request
              one as it is or with your changes, or to ask for a custom design.
            </p>
          </div>

          <SwappingHouseShowcase />
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
