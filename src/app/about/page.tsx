import { AboutUsPage } from "@/components/landing/about-us";
import { getDatabase } from "@/lib/database/mongodb";
import type { Professional } from "@/lib/professionals";
import { getAboutUsProfessionals } from "@/lib/server/professionals";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "About Us | G4 Builders Inc",
  description:
    "G4 Builders Incorporated: architects, engineers, designers, and contractors for house design, construction cost estimates, blueprints, and construction.",
};

export default async function AboutPage() {
  // Read on every visit, so a change in Maintenance shows on the next page load.
  await connection();
  let professionals: Professional[] = [];
  try {
    professionals = await getAboutUsProfessionals(await getDatabase());
  } catch (error) {
    // Without the database the page still shows, just without the architects and engineers.
    console.error("Unable to load the architects and engineers", { errorType: error instanceof Error ? error.name : "UnknownError" });
  }
  return <AboutUsPage professionals={professionals} />;
}
