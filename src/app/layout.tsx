import type { Metadata } from "next";
import { ContactUs } from "@/components/ui/contact-us";
import "./globals.css";

export const metadata: Metadata = {
  title: "G4 Builders Inc",
  description: "Construction cost estimation and billing system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <ContactUs />
      </body>
    </html>
  );
}
