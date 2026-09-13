"use client";

import { useEffect, useState } from "react";

export type BillingDashboardData = {
  pendingBillings: number;
  collectedThisMonth: number;
  overdueAccounts: number;
  invoicesReady: number;
  queueItems: { title: string; meta: string; amount: number; status: string }[];
  activityItems: { title: string; body: string; date: string }[];
};

const emptyData: BillingDashboardData = {
  pendingBillings: 0,
  collectedThisMonth: 0,
  overdueAccounts: 0,
  invoicesReady: 0,
  queueItems: [],
  activityItems: [],
};

export function useBillingDashboardData() {
  const [data, setData] = useState<BillingDashboardData>(emptyData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/billing-clerk", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as BillingDashboardData & {
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load billing records.");
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
            loadError instanceof Error ? loadError.message : "Unable to load billing records.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { ...data, error };
}
