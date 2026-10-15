import { designRequestTerms } from "@/lib/design-request-terms";
import { finishedDesignsTerms } from "@/lib/finished-designs-terms";

/**
 * The one Terms and Conditions a customer agrees to when registering (or on first sign-in for older accounts).
 * It combines the Finished Designs and Design Request terms; the version changes whenever either part changes.
 */
export const accountTerms = {
  version: `${finishedDesignsTerms.version}.${designRequestTerms.version}`,
  title: "G4 Builders Inc Terms and Conditions",
  introduction:
    "Please read these terms before creating your account or signing in. They cover viewing G4 Builders Inc designs and requesting a design, construction cost estimate, and blueprint.",
  notice: `${finishedDesignsTerms.notice} ${designRequestTerms.paymentNotice}`,
  sections: [...finishedDesignsTerms.sections, ...designRequestTerms.sections],
  cases: finishedDesignsTerms.cases,
  acknowledgment:
    "I have read and agree to the G4 Builders Inc Terms and Conditions. I will not copy, share, or build any G4 Builders Inc design without a written agreement, and I understand that only the blueprint is paid and that it unlocks after full payment is verified.",
} as const;

/** Exact text saved with each acceptance. */
export const accountTermsText = [
  accountTerms.title,
  `Version ${accountTerms.version}`,
  accountTerms.introduction,
  accountTerms.notice,
  ...accountTerms.sections.map((section, index) => `${index + 1}. ${section.title}\n${section.body}`),
  accountTerms.cases.heading,
  accountTerms.cases.introduction,
  ...accountTerms.cases.items.map((item, index) => `Case ${index + 1}: ${item.act}\nLaw: ${item.law}\nConsequence: ${item.consequence}`),
  accountTerms.acknowledgment,
].join("\n\n");

export type AccountTermsAcceptance = { version: string; acceptedAt: string };
