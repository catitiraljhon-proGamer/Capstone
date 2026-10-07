// Keep published versions unchanged; bump the version whenever the terms change.
export const finishedDesignsTerms = {
  version: "2026-10-08.4",
  title: "Finished Designs Terms and Conditions",
  introduction:
    "Please read these terms before viewing the finished house designs of G4 Builders Inc.",
  notice:
    "These designs belong to G4 Builders Inc and are protected by the Intellectual Property Code of the Philippines (RA 8293). You may view them only to choose a design to request.",
  sections: [
    {
      title: "Ownership",
      body: "All designs, images, and plans shown here are original works of G4 Builders Inc. They are protected by copyright under RA 8293, the Intellectual Property Code of the Philippines, from the moment they are created.",
    },
    {
      title: "Allowed use",
      body: "You may view the designs in this portal only to compare options, see estimated costs, and request a design from G4 Builders Inc.",
    },
    {
      title: "Not allowed",
      body: "Without written permission from G4 Builders Inc, you may not screenshot, download, copy, print, or share the designs, post them online, remove their watermark, or use them to build a house.",
    },
    {
      title: "Paid designs",
      body: "Paying the design fee allows you to build the design once, for the project in your request. G4 Builders Inc still owns the design, so you may not reuse or resell it for another project.",
    },
    {
      title: "Consequences",
      body: "Misuse may lead to suspension or closure of your account and to legal action, including civil and criminal penalties under RA 8293, the Intellectual Property Code of the Philippines.",
    },
  ],
  cases: {
    heading: "Examples of violations",
    introduction:
      "These are common examples of misuse and the part of RA 8293, the Intellectual Property Code of the Philippines, that applies.",
    items: [
      {
        act: "Copying or screenshotting a design",
        law: "RA 8293 (Intellectual Property Code of the Philippines): reproducing a work without the owner's permission is copyright infringement.",
        consequence: "Account suspension and possible legal action.",
      },
      {
        act: "Sharing a design or posting it online",
        law: "RA 8293 (Intellectual Property Code of the Philippines): distributing or showing a work to the public without permission is copyright infringement.",
        consequence: "Account closure and possible legal action.",
      },
      {
        act: "Building a design without an agreement with G4 Builders Inc",
        law: "RA 8293 (Intellectual Property Code of the Philippines), Section 186: the owner of a house design controls the construction of buildings that copy it.",
        consequence: "A court order to stop construction, damages, and possible penalties.",
      },
    ],
  },
  acknowledgment:
    "I have read and agree to the Finished Designs Terms and Conditions. I will not screenshot, copy, share, or build any G4 Builders Inc design without a written agreement with G4 Builders Inc.",
} as const;

export const finishedDesignsTermsText = [
  finishedDesignsTerms.title,
  `Version ${finishedDesignsTerms.version}`,
  finishedDesignsTerms.introduction,
  finishedDesignsTerms.notice,
  ...finishedDesignsTerms.sections.map(
    (section, index) => `${index + 1}. ${section.title}\n${section.body}`,
  ),
  finishedDesignsTerms.cases.heading,
  finishedDesignsTerms.cases.introduction,
  ...finishedDesignsTerms.cases.items.map(
    (item, index) =>
      `Case ${index + 1}: ${item.act}\nLaw: ${item.law}\nConsequence: ${item.consequence}`,
  ),
  finishedDesignsTerms.acknowledgment,
].join("\n\n");

export const finishedDesignsCopyrightNotice =
  "© G4 Builders Inc. These designs are protected by RA 8293 (Intellectual Property Code of the Philippines). Copying, sharing, or building them without permission is prohibited.";
