"use client";

import { useEffect, useState } from "react";

export type CustomerDashboardData = {
  currentDesign: string | null;
  estimatedBudget: number;
  pendingRequests: number;
  totalContractPrice: number;
  totalPaid: number;
  balanceDue: number;
  billingStages: {
    id: string;
    label: string;
    percentage: number;
    amount: number;
    status: string;
  }[];
  notifications: {
    id: string;
    title: string;
    body: string;
    href?: string;
    createdAt: string;
    isRead: boolean;
  }[];
  unreadNotifications: number;
};

const emptyData: CustomerDashboardData = {
  currentDesign: null,
  estimatedBudget: 0,
  pendingRequests: 0,
  totalContractPrice: 0,
  totalPaid: 0,
  balanceDue: 0,
  billingStages: [],
  notifications: [],
  unreadNotifications: 0,
};

export function useCustomerDashboardData() {
  const [data, setData] = useState<CustomerDashboardData>(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/dashboard/customer", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as CustomerDashboardData & {
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load customer records.");
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
              : "Unable to load customer records.",
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
