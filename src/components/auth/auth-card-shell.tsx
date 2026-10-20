import { BackButton } from "@/components/ui/back-button";
import { BrandLogo } from "@/components/ui/brand-logo";
import Link from "next/link";
import type { ReactNode } from "react";

type AuthCardShellProps = {
  title: string;
  description: string;
  backHref?: string;
  children: ReactNode;
};

/** Single centered card for short account flows such as resetting a password. */
export function AuthCardShell({ title, description, backHref = "/login", children }: AuthCardShellProps) {
  return (
    <div className="min-h-screen bg-white text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur">
        <nav aria-label="Account navigation" className="mx-auto flex min-h-20 w-full max-w-[1244px] items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 lg:px-8">
          <Link href="/" aria-label="G4 Builders home" className="min-w-0">
            <BrandLogo />
          </Link>
          <BackButton href={backHref} />
        </nav>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-[1244px] items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
