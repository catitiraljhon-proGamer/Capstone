export type HouseDesignStatus = "Draft" | "Published" | "Archived";

/** Quality of materials and finishes the customer expects; guides the Admin's design and estimate. */
export const finishLevels = ["Standard", "Semi-luxury", "Luxury"] as const;
export type FinishLevel = (typeof finishLevels)[number];

export const finishLevelDescriptions: Record<FinishLevel, string> = {
  Standard: "Durable, practical materials and finishes for a well-built home on a sensible budget.",
  "Semi-luxury": "Upgraded materials and fixtures with more design detail, at a moderate added cost.",
  Luxury: "Premium materials, fixtures, and detailing throughout, at a higher cost.",
};

export type HouseType = {
  heading: string;
  description: string;
  imgSrc: string;
};

export type ExteriorMaterialOption = {
  name: string;
  unit: string;
  unitPrice: number;
  quantity?: number;
};

export type ExteriorItemChoice = {
  item: string;
  detail: string;
  quantity?: number;
  quantityByArea?: number;
  options: ExteriorMaterialOption[];
};

export type HouseDesignCatalog = {
  houseTypes: HouseType[];
};

/** Exterior work the Admin adds to a design's estimate, such as perimeter fencing. */
export type CustomExteriorItem = {
  id: string;
  item: string;
  material: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

/** The completed construction project a design was created from, with its accepted cost estimate. Admin only. */
export type CompletedProjectSource = {
  projectId: string;
  projectReference: string;
  estimateReference: string | null;
  customerName: string;
  contractPrice: number;
  subtotal: number;
  completedAt: string;
  lineItems: {
    item: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
};

export type HouseDesign = {
  id: string;
  name: string;
  /** Optional sub-label shown under the card title. Falls back to houseType. */
  style?: string;
  /** Missing on designs saved while house types were turned off; the Admin assigns one when editing. */
  houseType?: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  /** Readable room setup built from the bedroom and bathroom counts, copied onto design requests. */
  rooms: string;
  rate: number;
  /** First image is the cover shown on cards. */
  images: string[];
  notes: string;
  status: HouseDesignStatus;
  customItems: CustomExteriorItem[];
  /** Id of the architect or engineer the design is credited to on the About Us page. */
  designedBy?: string;
  /** Set on designs created automatically when a construction project is completed. */
  sourceProject?: CompletedProjectSource;
  createdAt: string;
  createdBy: string;
};

/** "3 bedrooms, 2 bathrooms", the wording used by design requests too. */
export const formatRoomSetup = (bedrooms: number, bathrooms: number) =>
  `${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}, ${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`;

export const isDataImage = (src: string) => src.startsWith("data:");

/** Whole pesos drop the decimals; anything with centavos always shows two digits (₱783,565.20). */
export const formatPeso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);

const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Floor area times the cost rate, plus the custom exterior items the Admin added to the design. */
export function getDesignEstimate(
  design: Pick<HouseDesign, "area" | "rate"> & { customItems?: CustomExteriorItem[] },
) {
  const baseEstimate = roundAmount(design.area * design.rate);
  const customTotal = roundAmount((design.customItems ?? []).reduce(
    (total, item) => total + roundAmount(item.quantity * item.unitPrice),
    0,
  ));

  return { baseEstimate, customTotal, estimate: roundAmount(baseEstimate + customTotal) };
}
