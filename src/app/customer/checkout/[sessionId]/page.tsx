import type { Metadata } from "next";
import { PaymongoCheckout } from "@/components/billing/paymongo-checkout";

export const metadata: Metadata = { title: "Checkout | G4 Builders Inc", robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return <PaymongoCheckout sessionId={(await params).sessionId} />;
}
