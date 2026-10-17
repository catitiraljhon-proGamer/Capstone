import { MaintenanceScreen } from "@/components/maintenance/maintenance-screen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Under Maintenance | G4 Builders Inc",
  description: "G4 Builders Inc is under maintenance and will be back shortly.",
  robots: { index: false },
};

export default function MaintenancePage() {
  return <MaintenanceScreen />;
}
