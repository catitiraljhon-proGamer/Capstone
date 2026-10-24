import { AboutProfessionals } from "@/components/landing/about-professionals";
import { aboutUsServiceIcons } from "@/components/landing/about-us-services";
import { PublicHeader } from "@/components/landing/public-header";
import type { AboutUsContent } from "@/lib/about-us";
import type { Professional } from "@/lib/professionals";

/** The text comes from Maintenance > About Us, or the built-in text until the Admin saves their own. */
export function AboutUsPage({ content, professionals }: { content: AboutUsContent; professionals: Professional[] }) {
  return (
    <div className="min-h-screen bg-white text-stone-950">
      <PublicHeader />

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{content.tagline}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">About G4 Builders Incorporated</h1>
        <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-7 text-stone-600">{content.intro}</p>

        <section aria-labelledby="about-services" className="mt-10">
          <h2 id="about-services" className="text-lg font-semibold tracking-tight">What We Do</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {content.services.map(({ title, text }, index) => {
              const Icon = aboutUsServiceIcons[index];
              return (
                <li key={index} className="flex gap-3 rounded-xl border border-stone-200 p-4 shadow-sm">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-stone-950">{title}</span>
                    <span className="mt-1 block text-sm leading-6 text-stone-600">{text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <AboutProfessionals professionals={professionals} />
      </main>
    </div>
  );
}
