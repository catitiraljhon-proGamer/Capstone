// Keep published versions unchanged; bump the version whenever the terms change.
export const designRequestTerms = {
  version: "2026-10-02",
  title: "Design Request Terms and Conditions",
  introduction: "Please read these terms before submitting a design request to G4 Builders Inc.",
  paymentNotice: "You must pay the full design fee before you can view or download your requested design. Access opens only after the Billing Clerk verifies full payment.",
  sections: [
    {
      title: "Your request and feasibility review",
      body: "Provide accurate floor area, room requirements, finish preferences, descriptions, and inspiration images. The admin reviews whether your request is feasible before design work begins. Submitting a request does not guarantee approval or authorize construction.",
    },
    {
      title: "Design fee and invoice",
      body: "Once the approved design is completed, the Billing Clerk prepares the agreed design fee invoice. Check Billing Status for the amount, due date, and payment details. The design fee is separate from the construction contract price. Contact the team if the invoice does not match the fee discussed with you.",
    },
    {
      title: "Payment is required before design access",
      body: "The completed design stays locked until the full amount on its design fee invoice has been paid and verified. Partial payments, pending payments, and uploading payment proof alone do not unlock the design. Rejected payments do not count toward the fee. If a verified payment is reversed and a balance remains, access is locked again until full payment is verified.",
    },
    {
      title: "Submitting and verifying payment",
      body: "Use Billing Status to submit payment against the correct design fee invoice using an available payment method. Provide accurate payment details and any required reference or proof. Allow the Billing Clerk to verify the payment; submitting it does not provide immediate access. Agreeing to these terms does not make a payment or automatically charge you.",
    },
    {
      title: "Delivery and viewing your design",
      body: "Track review and completion in Design Requests or My House Design. Once the design is completed and full payment is verified, you can view and download the delivered design images in My House Design. Discuss the expected completion schedule with the team; submitting a request does not guarantee a delivery date.",
    },
    {
      title: "Changes, questions, and payment concerns",
      body: "Use Support to contact G4 Builders Inc about requirements, revisions, cancellation, or payment concerns. Confirm the scope, applicable conditions, and any additional fees with the team before proceeding with changes. Keep your invoice and payment reference for follow-up.",
    },
  ],
  acknowledgment: "I have read and agree to the Design Request Terms and Conditions. I understand that I can view or download my requested design only after the Billing Clerk verifies full payment of the design fee.",
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
