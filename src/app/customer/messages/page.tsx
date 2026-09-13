import { MessageModulePage } from "@/components/ui/message-module-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages | Customer | G4 Builders Inc",
  description: "Customer message module for contacting G4 Builders Inc staff.",
};

export default async function CustomerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ recipientRole?: string }>;
}) {
  const { recipientRole } = await searchParams;
  const initialRecipientRole =
    recipientRole === "billing-clerk" ? "billing-clerk" : "admin";

  return (
    <MessageModulePage
      role="Customer"
      dashboardHref="/customer"
      initialRecipientRole={initialRecipientRole}
    />
  );
}
