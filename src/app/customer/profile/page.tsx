import { CustomerProfilePage } from "@/components/ui/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Profile | G4 Builders Inc",
  description: "Customer profile details.",
};

export default function ProfilePage() {
  return <CustomerProfilePage />;
}
