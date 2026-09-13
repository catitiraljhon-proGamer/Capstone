import { MessageModulePage } from "@/components/ui/message-module-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages | Admin | G4 Builders Inc",
  description: "Admin message module for reviewing customer conversations.",
};

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;

  return (
    <MessageModulePage
      role="Admin"
      dashboardHref="/admin"
      initialCustomerId={customerId}
    />
  );
}
