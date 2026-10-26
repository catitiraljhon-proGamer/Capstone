import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import { AdminProjects } from "@/components/admin/admin-projects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects | G4 Builders Inc",
  description: "Admin project records and warranty claims.",
};

type SearchParams = Promise<{ tab?: string | string[]; claim?: string | string[] }>;

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const { tab, claim } = await searchParams;
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  const claimId = first(claim);
  return (
    <AdminSectionPage
      activeLabel="Projects"
      title="Projects"
      description="Monitor project records, status, and warranty claims."
      mainContent={
        <AdminProjects
          // A notification link to another claim opens it even when this page is already showing.
          key={`${first(tab) ?? ""}:${claimId ?? ""}`}
          initialTab={first(tab) === "warranty" ? "warranty" : "projects"}
          initialClaimId={claimId && /^[a-f\d]{24}$/i.test(claimId) ? claimId : null}
        />
      }
    >
    </AdminSectionPage>
  );
}
