export type MaintenanceKind = "finish" | "house-type";

export type FinishRecord = { id: string; value: string; active: boolean; designCount: number };

export type HouseTypeRecord = {
  id: string;
  heading: string;
  description: string;
  imgSrc: string;
  active: boolean;
  designCount: number;
};

export type MaintenanceData = {
  finishes: FinishRecord[];
  houseTypes: HouseTypeRecord[];
};
