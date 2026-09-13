import { MessageModulePage } from "@/components/ui/message-module-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages | Billing Clerk | G4 Builders Inc",
  description: "Billing clerk message module for reviewing customer messages.",
};

export default async function BillingClerkMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;

  return (
    <MessageModulePage
      role="Billing Clerk"
      dashboardHref="/billing-clerk"
      initialCustomerId={customerId}
    />
  );
}
