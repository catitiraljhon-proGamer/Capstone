export const designOptions = [
  {
    name: "Modern Minimalist",
    style: "Modern",
    houseType: "Modern",
    finish: "Standard",
    area: 150,
    rooms: "3 bedrooms, 2 toilets",
    rate: 40000,
    image: "/House/image.png",
    notes: "Clean layout for subdivision-ready residential builds.",
  },
  {
    name: "Modern Glass Front",
    style: "Modern",
    houseType: "Modern",
    finish: "Semi-luxury",
    area: 165,
    rooms: "3 bedrooms, 3 toilets",
    rate: 45000,
    image: "/House/Screenshot%202026-07-29%20003940.png",
    notes: "Modern facade with wider openings and stronger street presence.",
  },
  {
    name: "Contemporary Family",
    style: "Contemporary",
    houseType: "Contemporary",
    finish: "Semi-luxury",
    area: 180,
    rooms: "4 bedrooms, 3 toilets",
    rate: 48000,
    image: "/House/Screenshot%202026-07-29%20003940.png",
    notes: "Balanced room sizes with stronger facade treatment.",
  },
  {
    name: "Contemporary Corner Lot",
    style: "Contemporary",
    houseType: "Contemporary",
    finish: "Standard",
    area: 145,
    rooms: "3 bedrooms, 2 toilets",
    rate: 42000,
    image: "/House/Screenshot%202026-07-29%20011237.png",
    notes: "Compact contemporary plan with practical exterior materials.",
  },
  {
    name: "Compact Bungalow",
    style: "Minimalist",
    houseType: "Minimalist",
    finish: "Standard",
    area: 120,
    rooms: "2 bedrooms, 2 toilets",
    rate: 35000,
    image: "/House/Screenshot%202026-07-29%20003957.png",
    notes: "Lower starting estimate for smaller lots and budgets.",
  },
  {
    name: "Minimalist Two-Storey",
    style: "Minimalist",
    houseType: "Minimalist",
    finish: "Standard",
    area: 135,
    rooms: "3 bedrooms, 2 toilets",
    rate: 39000,
    image: "/House/image.png",
    notes: "Simple exterior composition with efficient floor area planning.",
  },
];

const roofOptions = [
  { name: "Rib-type long span roofing", unit: "sqm", quantity: 95, unitPrice: 1450 },
  { name: "Pre-painted metal tile roofing", unit: "sqm", quantity: 95, unitPrice: 1850 },
  { name: "Stone-coated steel roofing", unit: "sqm", quantity: 95, unitPrice: 2400 },
];

export const exteriorItemChoices = [
  {
    item: "Roof",
    detail: "Main roof material",
    quantityByArea: 0.63,
    options: roofOptions,
  },
  {
    item: "Exterior wall finish",
    detail: "Primer, skim coat, and weatherproof finish",
    quantityByArea: 1.4,
    options: [
      { name: "Standard exterior paint system", unit: "sqm", unitPrice: 520 },
      { name: "Elastomeric waterproof coating", unit: "sqm", unitPrice: 690 },
      { name: "Textured premium exterior finish", unit: "sqm", unitPrice: 860 },
    ],
  },
  {
    item: "Windows",
    detail: "Exterior window package",
    quantityByArea: 0.08,
    options: [
      { name: "Powder-coated aluminum windows", unit: "set", unitPrice: 11500 },
      { name: "Analok aluminum sliding windows", unit: "set", unitPrice: 13800 },
      { name: "uPVC awning windows", unit: "set", unitPrice: 16800 },
    ],
  },
  {
    item: "Main exterior door",
    detail: "Primary entry door",
    quantity: 1,
    options: [
      { name: "Steel panel entry door", unit: "set", unitPrice: 28000 },
      { name: "Solid wood entry door", unit: "set", unitPrice: 42000 },
      { name: "Aluminum glass entry door", unit: "set", unitPrice: 36000 },
    ],
  },
  {
    item: "Exterior accent cladding",
    detail: "Facade accent surface",
    quantityByArea: 0.16,
    options: [
      { name: "Ceramic facade tile accent", unit: "sqm", unitPrice: 1850 },
      { name: "Natural stone cladding", unit: "sqm", unitPrice: 3200 },
      { name: "Composite wood-look cladding", unit: "sqm", unitPrice: 2750 },
    ],
  },
  {
    item: "Gutter and downspout",
    detail: "Roof drainage line",
    quantityByArea: 0.28,
    options: [
      { name: "Pre-painted metal gutter", unit: "lm", unitPrice: 780 },
      { name: "PVC gutter system", unit: "lm", unitPrice: 620 },
      { name: "Seamless aluminum gutter", unit: "lm", unitPrice: 980 },
    ],
  },
  {
    item: "Exterior floor area",
    detail: "Porch, service area, and exterior landing",
    quantityByArea: 0.12,
    options: [
      { name: "Plain concrete exterior floor", unit: "sqm", unitPrice: 2200 },
      { name: "Non-slip exterior tiles", unit: "sqm", unitPrice: 3200 },
      { name: "Stamped concrete finish", unit: "sqm", unitPrice: 3800 },
    ],
  },
];

export const formatPeso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);

export function getExteriorEstimate(
  design: (typeof designOptions)[number],
  selections: number[],
) {
  const baseEstimate = design.area * design.rate;
  const exteriorRows = exteriorItemChoices.map((item, itemIndex) => {
    const selectedOption = item.options[selections[itemIndex] ?? 0];
    const quantity =
      typeof item.quantity === "number"
        ? item.quantity
        : Math.max(1, Math.round(design.area * item.quantityByArea));
    const amount = quantity * selectedOption.unitPrice;

    return {
      ...item,
      selectedOption,
      quantity,
      amount,
    };
  });
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
