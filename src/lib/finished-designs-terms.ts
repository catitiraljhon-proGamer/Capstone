// Keep published versions unchanged; bump the version whenever the terms change.
export const finishedDesignsTerms = {
  version: "2026-10-08",
  title: "Finished Designs Terms and Conditions",
  introduction:
    "Please read these terms before viewing the finished house designs of G4 Builders Inc.",
  notice:
    "All designs, images, plans, and drawings in Finished Designs are the intellectual property of G4 Builders Inc and are protected under Philippine law. You may view them only to choose a design to request from G4 Builders Inc.",
  sections: [
    {
      title: "Ownership of the designs",
      body: "Every design, rendering, floor plan, and drawing shown is an original work of G4 Builders Inc and its architects. Copyright protects these works from the moment they are created under Republic Act No. 8293 (Intellectual Property Code of the Philippines), as amended by RA 10372, which covers works of architecture and plans and drawings relating to architecture (Section 172). Signed and sealed architectural documents are also protected under Section 20 of RA 9266 (The Architecture Act of 2004).",
    },
    {
      title: "Permitted use",
      body: "You may view the designs only inside this portal to compare options, estimate costs, and submit a design request to G4 Builders Inc. Viewing a design does not give you any right to use, copy, or build it.",
    },
    {
      title: "Prohibited use",
      body: "Without written permission from G4 Builders Inc, you may not take screenshots, photographs, or screen recordings of the designs; download, save, copy, or print them; send them to another architect, designer, contractor, or builder; post them online; or use them to build, or to prepare plans for, any structure.",
    },
    {
      title: "Building a copied design",
      body: "Copyright in a work of architecture includes the right to control the construction of any building that reproduces the design in whole or in substantial part, or in a form recognizably derived from it (RA 8293, Section 186). Building a G4 Builders Inc design, or a recognizable copy of it, without a design agreement with G4 Builders Inc is copyright infringement.",
    },
    {
      title: "Watermarks and identifying marks",
      body: "Images may carry G4 Builders Inc watermarks or marks that identify you as the viewer. Do not remove, crop, blur, or alter these marks. Removing or altering information that identifies the copyright owner is a separate violation under the amended Intellectual Property Code.",
    },
    {
      title: "Requesting and paying for a design",
      body: "To use a design, submit a design request and pay the design fee. Paying the fee allows you to construct that design once, for the project stated in your request. G4 Builders Inc keeps the copyright (RA 8293, Section 178.4), so you may not reuse, resell, or share the design for another project without written consent.",
    },
    {
      title: "Consequences of misuse",
      body: "If you copy, share, or build a design in violation of these terms, G4 Builders Inc may suspend or close your account and may pursue civil remedies, such as an injunction and damages (RA 8293, Section 216), and criminal penalties, which include imprisonment and fines (RA 8293, Section 217).",
    },
    {
      title: "Record of your agreement",
      body: "Your agreement is recorded with your account, the terms version, and the date and time. You will be asked to agree again if these terms change.",
    },
  ],
  acknowledgment:
    "I have read and agree to the Finished Designs Terms and Conditions. I will not screenshot, copy, download, share, or build any G4 Builders Inc design without a written agreement with G4 Builders Inc.",
} as const;

export const finishedDesignsTermsText = [
  finishedDesignsTerms.title,
  `Version ${finishedDesignsTerms.version}`,
  finishedDesignsTerms.introduction,
  finishedDesignsTerms.notice,
  ...finishedDesignsTerms.sections.map(
    (section, index) => `${index + 1}. ${section.title}\n${section.body}`,
  ),
  finishedDesignsTerms.acknowledgment,
].join("\n\n");

export const finishedDesignsCopyrightNotice =
  "© G4 Builders Inc. These designs are protected under RA 8293 (Intellectual Property Code of the Philippines) and RA 9266. Copying, sharing, or building them without a written agreement with G4 Builders Inc is prohibited.";
