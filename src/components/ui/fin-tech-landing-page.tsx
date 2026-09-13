"use client";

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
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useHouseDesigns } from "@/lib/house-design-store";

type StatProps = {
  label: string;
  value: string;
};

type SoftButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

const Stat = ({ label, value }: StatProps) => (
  <div className="space-y-1">
    <div className="text-3xl font-semibold tracking-tight text-stone-950">
      {value}
    </div>
    <div className="text-sm text-stone-500">{label}</div>
  </div>
);

const SoftButton = ({ children, className = "", ...props }: SoftButtonProps) => (
  <button
    className={[
      "inline-flex items-center justify-center rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition",
      "hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2",
      className,
    ].join(" ")}
    {...props}
  >
    {children}
  </button>
);

const footerColumns = [
  {
    title: "Company",
    links: ["About Us", "Our Team", "Careers", "Projects", "Contact"],
  },
  {
    title: "Platform",
    links: ["Estimates", "Billing", "BOQ", "Reports", "Approvals"],
  },
  {
    title: "Resources",
    links: ["Help Center", "Guides", "Templates", "Cost Library", "Updates"],
  },
  {
    title: "Partners",
    links: ["Suppliers", "Subcontractors", "Consultants", "Developers"],
  },
  {
    title: "Legal",
    links: ["Privacy Policy", "Terms of Service", "Security", "Cookie Policy"],
  },
];

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

function SwappingHouseShowcase() {
  const { designs, isLoading } = useHouseDesigns();
  const projectImages = Array.from(
    new Set(designs.flatMap((design) => design.images)),
  ).slice(0, 4);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (projectImages.length < 2) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % projectImages.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [projectImages.length]);

  const activeImage = projectImages[activeIndex % projectImages.length];

  if (!activeImage) {
    return (
      <div className="grid aspect-[1.42/1] place-items-center rounded-xl border border-dashed border-stone-200 bg-stone-50 text-sm text-stone-500">
        {isLoading ? "Loading published designs…" : "No published designs yet."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        key={activeImage}
        initial={{ opacity: 0.35, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45 }}
        className="aspect-[1.42/1] overflow-hidden rounded-xl bg-stone-200 shadow-lg ring-1 ring-stone-200"
      >
        <div
          className="h-full w-full bg-cover bg-center"
          style={{
            backgroundImage: `url(${activeImage})`,
          }}
          aria-label={`House design ${activeIndex + 1}`}
          role="img"
        />
      </motion.div>

      <div className="grid grid-cols-4 gap-2">
        {projectImages.map((imageSrc, index) => (
          <button
            key={imageSrc}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={[
              "aspect-[1.42/1] overflow-hidden rounded-lg border bg-stone-100 transition",
              activeIndex === index
                ? "border-red-700 ring-2 ring-red-700/20"
                : "border-stone-200 hover:border-stone-300",
            ].join(" ")}
            aria-label={`Show house design ${index + 1}`}
          >
            <span
              className="block h-full w-full bg-cover bg-center"
              style={{
                backgroundImage: `url(${imageSrc})`,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function FooterLink({ children }: { children: ReactNode }) {
  return (
    <a href="#" className="text-sm text-stone-600 transition hover:text-red-700">
      {children}
    </a>
  );
}

function SocialIcon({ label }: { label: string }) {
  const iconClass = "h-4 w-4 fill-current";

  if (label === "GitHub") {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.41-4.04-1.41-.55-1.38-1.34-1.75-1.34-1.75-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.8c1.02 0 2.05.14 3.01.41 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" />
      </svg>
    );
  }

  if (label === "LinkedIn") {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5.01 2.5 2.5 0 0 1 0-5.01ZM3 9.75h4v10.76H3V9.75Zm6.25 0h3.84v1.47h.05c.54-1.02 1.86-1.86 3.82-1.86 4.09 0 4.84 2.69 4.84 6.19v4.96h-4v-4.39c0-1.05-.02-2.4-1.46-2.4-1.46 0-1.69 1.14-1.69 2.32v4.47h-4V9.75Z" />
      </svg>
    );
  }

  if (label === "Facebook") {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path d="M14.2 8.2V6.7c0-.72.48-.89.82-.89h2.08V2.2L14.24 2.2c-3.18 0-3.9 2.38-3.9 3.9v2.1H7.84v3.7h2.5V22h3.86V11.9h3.24l.43-3.7H14.2Z" />
      </svg>
    );
  }

  if (label === "YouTube") {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.12C19.55 3.58 12 3.58 12 3.58s-7.55 0-9.4.5A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.12c1.85.5 9.4.5 9.4.5s7.55 0 9.4-.5a3 3 0 0 0 2.1-2.12A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8ZM9.6 15.57V8.43L15.86 12 9.6 15.57Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
      <path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8ZM12 7.2A4.8 4.8 0 1 1 12 16.8 4.8 4.8 0 0 1 12 7.2Zm0 2A2.8 2.8 0 1 0 12 14.8 2.8 2.8 0 0 0 12 9.2Zm5.1-2.55a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z" />
    </svg>
  );
}

const socialLinks = ["GitHub", "LinkedIn", "Facebook", "YouTube", "Instagram"];

function LandingFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 lg:px-0">
        <div className="max-w-3xl">
          <BrandLogo />
          <p className="mt-8 text-sm leading-7 text-stone-600">
            G4 Builders Inc helps project teams estimate construction costs,
            review BOQ items, manage progress billing, and keep project reports
            clear from site work to office approvals.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-5 lg:grid-cols-[repeat(5,minmax(0,1fr))_1.45fr]">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold text-stone-950">
                {column.title}
              </h3>
              <div className="mt-5 flex flex-col gap-3">
                {column.links.map((link) => (
                  <FooterLink key={link}>{link}</FooterLink>
                ))}
              </div>
            </div>
          ))}

          <div className="col-span-2 md:col-span-5 lg:col-span-1">
            <h3 className="text-sm font-semibold text-stone-950">
              For Owners & Site Teams
            </h3>
            <button className="mt-4 w-full rounded-lg border border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:border-red-200 hover:bg-red-100">
              Get In Touch
            </button>

            <h3 className="mt-6 text-sm font-semibold text-stone-950">
              Quick Links
            </h3>
            <div className="mt-4 flex flex-col gap-3">
              {["Create Estimate", "Billing Dashboard", "Project Reports", "Support"].map(
                (link) => (
                  <FooterLink key={link}>{link}</FooterLink>
                ),
              )}
            </div>

            <div className="mt-6 border-t border-stone-200 pt-5">
              <h3 className="text-sm font-semibold text-stone-950">
                Follow Us
              </h3>
              <div className="mt-4 flex items-center gap-3 text-stone-500">
                {socialLinks.map((label) => (
                  <a
                    key={label}
                    href="#"
                    className="grid h-8 w-8 place-items-center rounded border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:bg-stone-100 hover:text-stone-950"
                    aria-label={`${label} social link`}
                  >
                    <SocialIcon label={label} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20 flex flex-col gap-4 text-xs text-stone-500 md:flex-row md:items-center md:justify-between">
          <p>Copyright {new Date().getFullYear()} G4 Builders Inc. All rights reserved.</p>
          <div className="flex gap-8">
            <FooterLink>Privacy</FooterLink>
            <FooterLink>Terms</FooterLink>
            <FooterLink>Sitemap</FooterLink>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function MoneyflowLandingPage() {
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
      <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-6 px-4 py-5 md:px-6 lg:px-0">
          <BrandLogo />
          <div className="hidden items-center gap-8 lg:flex">
            {["Estimates", "Billing", "Projects", "Reports"].map((item) => (
              <a
                key={item}
                href="#"
                className="text-sm text-stone-600 hover:text-stone-950"
              >
                {item}
              </a>
            ))}
          </div>
          <div className="hidden shrink-0 gap-2 md:flex">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-sm text-stone-700 hover:bg-red-50 hover:text-red-700"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
            >
              Register
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-6 px-4 pb-14 md:grid-cols-2 md:px-6 lg:px-0">
        <section className="flex flex-col justify-center space-y-8 pr-2">
          <div>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-stone-950 md:text-6xl">
              Build costs
              <br />
              with control.
            </h1>
            <p className="mt-4 max-w-md text-stone-600">
              A construction cost estimation and billing workspace for G4
              Builders Inc, built to keep quantities, approvals, invoices, and
              project margins aligned.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-2 md:max-w-sm">
            <Stat label="Published Designs" value={String(stats.publishedDesigns)} />
            <Stat label="Active Projects" value={String(stats.activeProjects)} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-5 opacity-75">
            <span className="text-xs text-stone-500">BUILT FOR SITE TEAMS</span>
            <div className="flex items-center gap-5 text-sm font-semibold text-stone-400">
              <span>BOQ</span>
              <span>Progress Billing</span>
              <span>Cost Tracking</span>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
              Live project data from MongoDB
            </div>
            <MiniBars />
          </motion.div>

          <div className="hidden md:block" />
        </section>
      </main>

      <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-10 px-4 py-20 md:grid-cols-[0.9fr_1.1fr] md:px-6 lg:px-0">
          <div>
            <p className="text-sm font-semibold text-red-700">
              Better every project
            </p>
            <h2 className="mt-6 max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight text-stone-950 md:text-6xl">
              See costs move before they become problems.
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">
              Rotate through site progress, material planning, billing reviews,
              and office coordination in one visual workspace for G4 Builders
              Inc.
            </p>
            <div className="mt-8">
              <SoftButton>
                Review Projects <ArrowUpRight className="ml-1 h-4 w-4" />
              </SoftButton>
            </div>
          </div>

          <SwappingHouseShowcase />
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
