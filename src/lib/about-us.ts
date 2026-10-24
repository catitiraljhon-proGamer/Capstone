/** The About Us page text the Admin edits in Maintenance > About Us. */
export type AboutUsContent = {
  /** The short line above the page title. */
  tagline: string;
  intro: string;
  /** The What We Do items, always four; each keeps the icon of its position. */
  services: { title: string; text: string }[];
};

export const aboutUsServiceCount = 4;

export const aboutUsLimits = {
  tagline: 120,
  intro: 1_000,
  serviceTitle: 60,
  serviceText: 300,
} as const;

/** The text the page showed before it could be edited; used until the Admin saves their own. */
export const defaultAboutUs: AboutUsContent = {
  tagline: "Architects · Engineers · Designers · Contractor",
  intro:
    "G4 Builders Incorporated is a team of architects, engineers, designers, and contractors. We take your house from the first design to the finished build, with clear costs and billing at every stage.",
  services: [
    { title: "House Design", text: "Custom house designs and floor plans based on your requirements, or one of our published designs." },
    { title: "Construction Cost Estimates", text: "An itemized estimate with quantities and a payment schedule, free to review before you commit." },
    { title: "Blueprints", text: "Complete plans prepared once you approve your design and accept the estimate." },
    { title: "Construction", text: "We build your house and bill by stage, so you pay as the work progresses." },
  ],
};

/** Admin view: the current text and who last saved it (none while the built-in text is shown). */
export type AboutUsView = {
  content: AboutUsContent;
  changedBy: string | null;
  changedAt: string | null;
};
