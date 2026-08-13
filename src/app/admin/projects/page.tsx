import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import { AdminProjectSlides } from "@/components/ui/admin-project-slides";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects | G4 Builders Inc",
  description: "Admin project records.",
};

export default function ProjectsPage() {
  return (
    <AdminSectionPage
      activeLabel="Projects"
      title="Projects"
      description="Monitor project records, status, and assigned teams."
      mainContent={<AdminProjectSlides />}
    >
    </AdminSectionPage>
  );
}
