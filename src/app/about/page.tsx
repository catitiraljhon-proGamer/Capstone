import { AboutUsPage } from "@/components/landing/about-us";
import { defaultAboutUs, type AboutUsContent } from "@/lib/about-us";
import { getDatabase } from "@/lib/database/mongodb";
import type { Professional } from "@/lib/professionals";
import { getAboutUsContent } from "@/lib/server/about-us";
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
  let content: AboutUsContent = defaultAboutUs;
  let professionals: Professional[] = [];
  try {
    const db = await getDatabase();
    [content, professionals] = await Promise.all([getAboutUsContent(db), getAboutUsProfessionals(db)]);
  } catch (error) {
    // Without the database the page still shows the built-in text, just without the team.
    console.error("Unable to load the About Us page", { errorType: error instanceof Error ? error.name : "UnknownError" });
  }
  return <AboutUsPage content={content} professionals={professionals} />;
}
