import { designRequestTerms } from "@/lib/design-request-terms";
import { finishedDesignsTerms } from "@/lib/finished-designs-terms";

/** One published version of the Terms and Conditions a customer agrees to. */
export type AccountTermsContent = {
  version: string;
  title: string;
  introduction: string;
  noticeTitle: string;
  notice: string;
  sections: { title: string; body: string }[];
  /** Specific prohibited acts with the law and consequence for each; hidden when there are none. */
  cases: {
    heading: string;
    introduction: string;
    items: { act: string; law: string; consequence: string }[];
  };
  acknowledgment: string;
};

/**
 * The built-in Terms and Conditions: what customers agree to until the Admin publishes a version in Maintenance.
 * It combines the Finished Designs and Design Request terms; its version is the newer of their two versions.
 */
export const accountTerms: AccountTermsContent = {
  version: [finishedDesignsTerms.version, designRequestTerms.version].sort().at(-1)!,
  title: "G4 Builders Inc Terms and Conditions",
  introduction:
    "Please read these terms before creating your account or signing in. They cover viewing G4 Builders Inc designs and requesting a design, construction cost estimate, and blueprint.",
  noticeTitle: "Protected Designs · Only the Blueprint Is Paid",
  notice: `${finishedDesignsTerms.notice} ${designRequestTerms.paymentNotice}`,
  sections: [...finishedDesignsTerms.sections, ...designRequestTerms.sections],
  cases: { ...finishedDesignsTerms.cases, items: [...finishedDesignsTerms.cases.items] },
  acknowledgment:
    "I have read and agree to the G4 Builders Inc Terms and Conditions. I will not copy, share, or build any G4 Builders Inc design without a written agreement, and I understand that only the blueprint is paid and that it unlocks after full payment is verified.",
};

/** Exact text saved with each acceptance and each published version. */
export function termsText(terms: AccountTermsContent) {
  return [
    terms.title,
    `Version ${terms.version}`,
    terms.introduction,
    terms.notice,
    ...terms.sections.map((section, index) => `${index + 1}. ${section.title}\n${section.body}`),
    ...(terms.cases.items.length ? [terms.cases.heading, terms.cases.introduction] : []),
    ...terms.cases.items.map((item, index) => `Case ${index + 1}: ${item.act}\nLaw: ${item.law}\nConsequence: ${item.consequence}`),
    terms.acknowledgment,
  ].join("\n\n");
}

/** Exact text of the built-in terms. */
export const accountTermsText = termsText(accountTerms);

export type AccountTermsAcceptance = { version: string; acceptedAt: string };

/** Admin view (Maintenance > Terms and Conditions): the current terms and every published version, newest first. */
export type AccountTermsView = {
  current: AccountTermsContent;
  /** The built-in terms have no publisher. */
  versions: { version: string; publishedBy: string | null; publishedAt: string | null }[];
};
