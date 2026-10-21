"use client";

import { BrandLogo } from "@/components/ui/brand-logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "FAQ", href: "/faq" },
];

const navLinkClass =
  "rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700";

/** Header shared by the public pages (Home, About Us, FAQ) so every page keeps the same links. */
export function PublicHeader() {
  const pathname = usePathname();

  /** On the home page, Home scrolls back to the top instead of reloading. */
  function backToTop(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    event.preventDefault();
    window.history.replaceState(null, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-white/90 backdrop-blur">
      <nav aria-label="Main navigation" className="mx-auto flex w-full max-w-[1244px] flex-col items-center gap-3 px-4 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-6 sm:px-6 lg:px-8">
        <Link href="/" onClick={backToTop} aria-label="G4 Builders home" className="min-w-0 sm:justify-self-start">
          <BrandLogo />
        </Link>
        <div className="flex items-center gap-1">
          {navLinks.map(({ label, href }) => {
            const current = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={href === "/" ? backToTop : undefined}
                aria-current={current ? "page" : undefined}
                className={`${navLinkClass} ${current ? "text-red-700" : "text-stone-700"}`}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:justify-self-end">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Register
          </Link>
        </div>
      </nav>
    </header>
  );
}
