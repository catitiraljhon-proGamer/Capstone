import { MessageModulePage } from "@/components/ui/message-module-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages | Customer | G4 Builders Inc",
  description: "Customer message module for contacting G4 Builders Inc staff.",
};

export default function CustomerMessagesPage() {
  return (
    <MessageModulePage
      role="Customer"
      name="John Doe"
      dashboardHref="/customer"
    />
  );
}
