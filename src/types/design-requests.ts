import type { HouseDesignFinish } from "@/components/ui/house-design-data";

export type DesignRequestDto = {
  id: string;
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
