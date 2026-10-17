"use client";

import { maintenanceScreenId } from "@/components/maintenance/maintenance-banner";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { formatMaintenanceEnd, formatTimeLeft } from "@/lib/maintenance-mode";
import { useMaintenanceMode } from "@/lib/use-maintenance-mode";
import { Clock3, LogOut, RefreshCw, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Shown in place of customer and Billing Clerk pages while maintenance mode is on. */
export function MaintenanceScreen() {
  const { status, isActive, failed, now } = useMaintenanceMode();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const wasActive = Boolean(status?.active);

  // Maintenance ended (by time or by the Admin): reload so the page the person opened comes back.
  useEffect(() => {
    if (wasActive && !isActive) window.location.reload();
  }, [wasActive, isActive]);

  const logOut = async () => {
    setIsLoggingOut(true);
    await fetch("/api/auth/logout", { method: "DELETE" }).catch(() => undefined);
    window.location.replace("/");
  };

  return (
    <main id={maintenanceScreenId} className="flex min-h-screen flex-1 items-center justify-center bg-white px-4 py-12 text-stone-950">
      <div className="w-full max-w-lg text-center">
        <div className="flex justify-center"><BrandLogo compact /></div>
        <span className="mx-auto mt-8 grid h-14 w-14 place-items-center rounded-xl bg-rose-50 text-red-700">
          <Wrench className="h-7 w-7" aria-hidden="true" />
        </span>

        {status === null ? (
          failed ? (
            <>
              <h1 className="mt-6 text-3xl font-semibold tracking-tight">We Can&apos;t Reach the System</h1>
              <p className="mt-3 text-base leading-7 text-stone-600">The system may still be under maintenance. Check again in a few minutes.</p>
            </>
          ) : <p className="mt-6 text-sm text-stone-600">Checking the system status…</p>
        ) : isActive && status.endsAt ? (
          <>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight">System Under Maintenance</h1>
            <p className="mt-3 text-base leading-7 text-stone-600">
              {status.message || "We're making improvements to G4 Builders Inc. Your projects, invoices, and payments are safe."}
            </p>
            <div className="mx-auto mt-6 max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-sm" role="status" aria-live="polite">
              <p className="flex items-center justify-center gap-2 text-sm text-stone-600">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                Back around
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-red-700">{formatMaintenanceEnd(status.endsAt, now)}</p>
              <p className="mt-1 text-sm text-stone-500">About {formatTimeLeft(status.endsAt, now)} left</p>
            </div>
            <p className="mt-5 text-sm text-stone-500">This page reloads by itself when the system is back.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight">The System Is Available</h1>
            <p className="mt-3 text-base leading-7 text-stone-600">Maintenance is finished. You can continue where you left off.</p>
          </>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {isActive ? (
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Check Again
            </Button>
          ) : (
            <Button asChild><Link href="/">Go to Home</Link></Button>
          )}
          <Button type="button" variant="ghost" disabled={isLoggingOut} onClick={() => void logOut()}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />{isLoggingOut ? "Logging Out…" : "Log Out"}
          </Button>
        </div>
      </div>
    </main>
  );
}
