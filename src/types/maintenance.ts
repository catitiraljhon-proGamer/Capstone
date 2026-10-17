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

/** Public maintenance-mode status; `endsAt` is an ISO time while maintenance is on. */
export type MaintenanceModeStatus = {
  active: boolean;
  endsAt: string | null;
  message: string | null;
  startedAt: string | null;
  startedByName: string | null;
};
