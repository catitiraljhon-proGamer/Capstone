// Keep published versions unchanged; bump the version whenever the terms change.
export const designRequestTerms = {
  version: "2026-10-21",
  title: "Design Request Terms and Conditions",
  introduction: "Please read these terms before submitting a design request to G4 Builders Inc.",
  paymentNotice: "The design and floor plan review is free. You pay only for the blueprint, after you approve the design, and it unlocks once the Billing Clerk verifies full payment of the blueprint fee. Construction is optional and comes after.",
  sections: [
    {
      title: "Your Request and Feasibility Review",
      body: "Provide accurate floor area, room requirements, finish preferences, descriptions, and inspiration images. The admin reviews whether your request is feasible before design work begins. Submitting a request does not guarantee approval or authorize construction.",
    },
    {
      title: "Design and Floor Plan Review",
      body: "Once your request is approved, the admin shares the design and floor plan in Dream House. These previews are watermarked and are provided only for your review. You may approve the design or request changes, and the admin will send a revised version. Review rounds are free.",
    },
    {
      title: "Blueprint Fee and Invoice",
      body: "After you approve the design, the admin prepares your blueprint and the Billing Clerk sets the blueprint fee and issues its invoice in Billing Status. The blueprint fee is separate from any construction contract price. Contact the team if the invoice does not match the fee discussed with you.",
    },
    {
      title: "Payment Is Required Before Blueprint Access",
      body: "The blueprint stays locked until the full amount on its invoice has been paid and verified. Partial payments, pending payments, and uploading payment proof alone do not unlock it. Rejected payments do not count toward the fee. If a verified payment is reversed and a balance remains, access is locked again until full payment is verified.",
    },
    {
      title: "Getting Your Blueprint",
      body: "Once the blueprint fee is fully paid, you can download the blueprint in Dream House, and you can also pick up a printed copy at the G4 Builders Inc office. Request a pickup time during office hours (Monday to Friday, 8:00 AM to 12:00 PM and 1:30 PM to 5:00 PM; Saturday, 8:00 AM to 12:00 PM). The admin confirms the time.",
    },
    {
      title: "Construction Cost Estimate (Optional)",
      body: "After the blueprint is paid, you may choose to proceed to construction and request a construction cost estimate. You may accept the estimate or ask for a revision. Requesting or reviewing an estimate is free and does not charge you.",
    },
    {
      title: "Construction Billing",
      body: "If you proceed to construction, the downpayment invoice is issued after you accept the estimate. Progress billings then follow the payment schedule in your accepted estimate.",
    },
    {
      title: "Use of Designs, Questions, and Payment Concerns",
      body: "Design previews and blueprints remain the property of G4 Builders Inc. Do not copy, share, or remove watermarks from them. Use Support to contact G4 Builders Inc about requirements, revisions, cancellation, or payment concerns, and keep your invoice and payment reference for follow-up.",
    },
  ],
  acknowledgment: "I have read and agree to the Design Request Terms and Conditions. I understand that the design and floor plan are shared for review only, and that I can download the blueprint only after the Billing Clerk verifies full payment of the blueprint fee.",
} as const;
