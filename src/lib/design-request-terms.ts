// Keep published versions unchanged; bump the version whenever the terms change.
export const designRequestTerms = {
  version: "2026-10-15",
  title: "Design Request Terms and Conditions",
  introduction: "Please read these terms before submitting a design request to G4 Builders Inc.",
  paymentNotice: "The design, floor plan, and construction cost estimate are free. You pay only for the blueprint, after you accept the cost estimate. The blueprint unlocks once the Billing Clerk verifies full payment of the blueprint fee.",
  sections: [
    {
      title: "Your request and feasibility review",
      body: "Provide accurate floor area, room requirements, finish preferences, descriptions, and inspiration images. The admin reviews whether your request is feasible before design work begins. Submitting a request does not guarantee approval or authorize construction.",
    },
    {
      title: "Design and floor plan review",
      body: "Once your request is approved, the admin shares the design and floor plan in Dream House. These previews are watermarked and are provided only for your review. You may approve the design or request changes, and the admin will send a revised version. Review rounds are free.",
    },
    {
      title: "Construction cost estimate",
      body: "After you approve the design, you may request a construction cost estimate. You may accept the estimate or ask for a revision. Requesting or reviewing an estimate is free and does not charge you.",
    },
    {
      title: "Blueprint fee and invoice",
      body: "After you accept the cost estimate, the Billing Clerk sets the blueprint fee and issues its invoice in Billing Status. The blueprint fee is separate from the construction contract price. Contact the team if the invoice does not match the fee discussed with you.",
    },
    {
      title: "Payment is required before blueprint access",
      body: "The blueprint stays locked until the full amount on its invoice has been paid and verified. Partial payments, pending payments, and uploading payment proof alone do not unlock it. Rejected payments do not count toward the fee. If a verified payment is reversed and a balance remains, access is locked again until full payment is verified.",
    },
    {
      title: "Construction billing",
      body: "The construction downpayment invoice is issued only after the blueprint fee is fully paid. Progress billings then follow the payment schedule in your accepted estimate.",
    },
    {
      title: "Use of designs, questions, and payment concerns",
      body: "Design previews and blueprints remain the property of G4 Builders Inc. Do not copy, share, or remove watermarks from them. Use Support to contact G4 Builders Inc about requirements, revisions, cancellation, or payment concerns, and keep your invoice and payment reference for follow-up.",
    },
  ],
  acknowledgment: "I have read and agree to the Design Request Terms and Conditions. I understand that the design and floor plan are shared for review only, and that I can download the blueprint only after the Billing Clerk verifies full payment of the blueprint fee.",
} as const;

export const designRequestTermsText = [
  designRequestTerms.title,
  `Version ${designRequestTerms.version}`,
  designRequestTerms.introduction,
  designRequestTerms.paymentNotice,
  ...designRequestTerms.sections.map((section, index) => `${index + 1}. ${section.title}\n${section.body}`),
  designRequestTerms.acknowledgment,
].join("\n\n");

export type DesignTermsAcceptance = {
  id: string;
  version: string;
  acceptedAt: string;
};
