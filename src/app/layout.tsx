import type { Metadata } from "next";
import { IdleSignOut } from "@/components/auth/idle-sign-out";
import { ContactUs } from "@/components/landing/contact-us";
import { MaintenanceBanner } from "@/components/maintenance/maintenance-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "G4 Builders Inc",
  description: "House design, construction cost estimates, blueprints, and construction by G4 Builders Incorporated.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <MaintenanceBanner />
        <IdleSignOut />
        {children}
        <ContactUs />
      </body>
    </html>
  );
}
