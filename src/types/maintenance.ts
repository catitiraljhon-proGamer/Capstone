import type { ExteriorMaterialOption } from "@/lib/house-design-data";

export type MaintenanceKind = "finish" | "house-type" | "exterior-item";

export type FinishRecord = { id: string; value: string; active: boolean; designCount: number };

export type HouseTypeRecord = {
  id: string;
  heading: string;
  description: string;
  imgSrc: string;
  active: boolean;
  designCount: number;
};

export type ExteriorItemRecord = {
  id: string;
  item: string;
  detail: string;
  quantity?: number;
  quantityByArea?: number;
  options: ExteriorMaterialOption[];
  active: boolean;
};

export type MaintenanceData = {
  finishes: FinishRecord[];
  houseTypes: HouseTypeRecord[];
  exteriorItems: ExteriorItemRecord[];
};
