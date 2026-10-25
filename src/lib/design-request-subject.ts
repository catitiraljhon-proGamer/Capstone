import type { RequestedHouseDesign } from "@/types/design-requests";

type DesignRequestNameParts = {
  selectedDesign?: Pick<RequestedHouseDesign, "name">;
  floorArea: number;
  houseType?: string;
};

/** "Garden Wall Residence — design request", or "150 sqm Modern design request" for a custom request. */
export function designRequestSubject(request: DesignRequestNameParts) {
  return request.selectedDesign
    ? `${request.selectedDesign.name} — design request`
    : `${request.floorArea.toLocaleString("en-PH")} sqm ${request.houseType ? `${request.houseType} ` : ""}design request`;
}

/** The subject plus the date it was sent, so two similar requests can be told apart in a list. */
export function designRequestName(request: DesignRequestNameParts & { createdAt: Date }) {
  const sent = request.createdAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  return `${designRequestSubject(request)} (${sent})`;
}
