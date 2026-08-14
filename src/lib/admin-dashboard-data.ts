export type AdminDashboardSummary = {
  activeProjects: number;
  pendingApprovals: number;
  pendingBilling: number;
  totalClients: number;
};

export type PendingApprovalRecord = {
  reference: string;
  client: string;
  type: string;
  status: "Pending";
  href: string;
};

export type RecentActivityRecord = {
  title: string;
  date: string;
};

const projects: { status: "Active" | "Completed" | "Pending" }[] = [];
const approvals: PendingApprovalRecord[] = [];
const billingRecords: { status: "Pending" | "Paid" | "Overdue" }[] = [];
const clients: { role: "Client" }[] = [];
const activities: RecentActivityRecord[] = [];

export function getAdminDashboardData() {
  const summary: AdminDashboardSummary = {
    activeProjects: projects.filter((project) => project.status === "Active").length,
    pendingApprovals: approvals.filter((approval) => approval.status === "Pending").length,
    pendingBilling: billingRecords.filter((billing) => billing.status === "Pending").length,
    totalClients: clients.length,
  };

  return {
    summary,
    pendingApprovals: approvals.slice(0, 5),
    recentActivities: activities.slice(0, 5),
  };
}
