export type HouseDesignFinish = "Standard" | "Semi-luxury" | "Luxury";
export type HouseDesignStatus = "Draft" | "Published" | "Archived";

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
  finishes: HouseDesignFinish[];
  houseTypes: HouseType[];
  exteriorItems: ExteriorItemChoice[];
};

/** An extra exterior line item defined by admin, outside the standard list. */
export type CustomExteriorItem = {
  id: string;
  item: string;
  material: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

export type HouseDesign = {
  id: string;
  name: string;
  /** Optional sub-label shown under the card title. Falls back to houseType. */
  style?: string;
  houseType: string;
  finish: HouseDesignFinish;
  area: number;
  rooms: string;
  rate: number;
  /** First image is the cover shown on cards. */
  images: string[];
  notes: string;
  status: HouseDesignStatus;
  /** One option index per entry in exteriorItemChoices. */
  defaultSelections: number[];
  customItems: CustomExteriorItem[];
  createdAt: string;
  createdBy: string;
};

export const createDefaultSelections = (items: ExteriorItemChoice[]) =>
  items.map(() => 0);

/** Pads or trims a stored selection list so it always matches the item list. */
export function normalizeSelections(
  selections: number[] | undefined,
  items: ExteriorItemChoice[],
) {
  return items.map((item, index) => {
    const value = selections?.[index] ?? 0;
    return value >= 0 && value < item.options.length ? value : 0;
  });
}

export const isDataImage = (src: string) => src.startsWith("data:");

export const formatPeso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);

/** One rendered line in the material breakdown, standard or custom. */
export type EstimateRow = {
  key: string;
  item: string;
  detail: string;
  material: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  isCustom: boolean;
};

export function getExteriorEstimate(
  design: Pick<HouseDesign, "area" | "rate"> & {
    customItems?: CustomExteriorItem[];
  },
  selections: number[],
  items: ExteriorItemChoice[],
) {
  const baseEstimate = design.area * design.rate;

  const standardRows: EstimateRow[] = items.map(
    (item, itemIndex) => {
      const selectedOption =
        item.options[selections[itemIndex] ?? 0] ?? item.options[0];
      const quantity =
        typeof item.quantity === "number"
          ? item.quantity
          : Math.max(1, Math.round(design.area * (item.quantityByArea ?? 0)));

      return {
        key: item.item,
        item: item.item,
        detail: item.detail,
        material: selectedOption.name,
        unit: selectedOption.unit,
        quantity,
        unitPrice: selectedOption.unitPrice,
        amount: quantity * selectedOption.unitPrice,
        isCustom: false,
      };
    },
  );

  const customRows: EstimateRow[] = (design.customItems ?? []).map((item) => ({
    key: item.id,
    item: item.item,
    detail: "Custom exterior item",
    material: item.material,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.quantity * item.unitPrice,
    isCustom: true,
  }));

  const exteriorRows = [...standardRows, ...customRows];
  const exteriorTotal = exteriorRows.reduce(
    (total, material) => total + material.amount,
    0,
  );

  return {
    baseEstimate,
    exteriorRows,
    exteriorTotal,
    revisedEstimate: baseEstimate + exteriorTotal,
  };
}
