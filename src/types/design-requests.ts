import type { HouseDesignFinish } from "@/lib/house-design-data";

export type RequestedHouseDesign = {
  id: string;
  name: string;
  houseType: string;
  floorArea: number;
  rooms: string;
  finish: HouseDesignFinish;
};

export type DesignRequestDto = {
  id: string;
  selectedDesign?: RequestedHouseDesign;
  floorArea: number;
  bedrooms?: number;
  bathrooms?: number;
  rooms: string;
  finish: HouseDesignFinish;
  notes: string;
  inspirationImages: string[];
  status: "Pending" | "In review" | "Approved" | "Rejected" | "Completed";
  completedAt?: string;
  createdAt: string;
  imageCount: number;
  access: "in-progress" | "awaiting-invoice" | "payment-required" | "unlocked";
  invoice: { id: string; number: string; amount: number; paid: number; balance: number; pending: number } | null;
};
