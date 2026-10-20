import { AboutUsPage } from "@/components/landing/about-us";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us | G4 Builders Inc",
  description:
    "G4 Builders Incorporated: architects, engineers, designers, and contractors for house design, construction cost estimates, blueprints, and construction.",
};

export default function AboutPage() {
  return <AboutUsPage />;
}
