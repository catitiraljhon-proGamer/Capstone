import { MessageModulePage } from "@/components/ui/message-module-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages | Billing Clerk | G4 Builders Inc",
  description: "Billing clerk message module for reviewing customer messages.",
};

export default function BillingClerkMessagesPage() {
  return (
    <MessageModulePage
      role="Billing Clerk"
      name="Billing Clerk"
      dashboardHref="/billing-clerk"
    />
  );
}
