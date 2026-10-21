import { FaqPage } from "@/components/landing/faq";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ | G4 Builders Inc",
  description:
    "Answers to common questions about G4 Builders Inc house design requests, blueprints, construction cost estimates, payments, and progress billing.",
};

export default function FaqRoute() {
  return <FaqPage />;
}
