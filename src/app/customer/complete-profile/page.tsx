import { CompleteProfileForm } from "@/components/clients/complete-profile-form";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LogoutButton } from "@/components/ui/logout-button";
import { getDatabase } from "@/lib/database/mongodb";
import { getClient } from "@/lib/server/clients";
import { readSession } from "@/lib/server/session";
import { roleHomePaths } from "@/types/domain";
import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Complete Your Client Information | G4 Builders Inc",
  description: "Add your client details before using the G4 Builders Inc customer portal.",
  robots: { index: false, follow: false },
};

export default async function CompleteProfilePage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "customer") redirect(roleHomePaths[session.role]);

  const client = await getClient(await getDatabase(), session, session.id);
  if (client.profileComplete) redirect("/customer");

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex min-h-20 w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <BrandLogo />
          <div className="w-32 shrink-0">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-700 text-white">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700">Welcome, {client.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Complete your client information
            </h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Before you start, tell us how to reach you. The G4 Builders team
              uses these details for your design requests, estimates, and
              billing.
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
          <CompleteProfileForm client={client} />
        </section>
      </main>
    </div>
  );
}
