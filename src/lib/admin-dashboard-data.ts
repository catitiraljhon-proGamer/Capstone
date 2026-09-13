"use client";

import { useEffect, useState } from "react";

export type AdminDashboardData = {
  summary: {
    activeProjects: number;
    pendingApprovals: number;
    pendingBilling: number;
    totalClients: number;
    totalUsers: number;
  };
  pendingApprovals: {
    reference: string;
    client: string;
    type: string;
    status: "Pending";
    href: string;
  }[];
};

const emptyData: AdminDashboardData = {
  summary: {
    activeProjects: 0,
    pendingApprovals: 0,
    pendingBilling: 0,
    totalClients: 0,
    totalUsers: 0,
  },
  pendingApprovals: [],
};

export function useAdminDashboardData() {
  const [data, setData] = useState<AdminDashboardData>(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/dashboard/admin", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as AdminDashboardData & {
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load dashboard data.");
        return payload;
      })
      .then((payload) => {
        if (active) {
          setData(payload);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load dashboard data.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { ...data, isLoading, error };
}
