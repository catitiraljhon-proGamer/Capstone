import { SignInPage } from "@/components/ui/sign-in";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log In | G4 Builders Inc",
  description: "Access the G4 Builders Inc cost estimation and billing system.",
};

export default function LoginPage() {
  return <SignInPage />;
}
