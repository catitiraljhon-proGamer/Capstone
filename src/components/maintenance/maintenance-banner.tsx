"use client";

import { formatMaintenanceEnd, formatTimeLeft } from "@/lib/maintenance-mode";
import { useMaintenanceMode } from "@/lib/use-maintenance-mode";
import { Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const pausedPortals = ["/customer", "/billing-clerk"];
/** Rendered by MaintenanceScreen. The proxy shows that screen under the portal's own address, so the path alone can't tell. */
export const maintenanceScreenId = "maintenance-screen";
const showingMaintenanceScreen = () => typeof document !== "undefined" && Boolean(document.getElementById(maintenanceScreenId));

/** Site-wide notice while maintenance mode is on. */
export function MaintenanceBanner() {
  const pathname = usePathname();
  const { status, isActive, now } = useMaintenanceMode();
  const onPausedPortal = pausedPortals.some((prefix) => pathname.startsWith(prefix));

  // Someone already inside a portal when maintenance starts is moved to the maintenance screen.
  useEffect(() => {
    if (isActive && onPausedPortal && !showingMaintenanceScreen()) window.location.reload();
  }, [isActive, onPausedPortal]);

  // status is only set after mounting, so reading the page here never affects hydration.
  if (!isActive || !status?.endsAt || showingMaintenanceScreen()) return null;
  const until = formatMaintenanceEnd(status.endsAt, now);

  return (
    <div role="status" className="bg-red-800 px-4 py-2.5 text-sm text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
        {pathname.startsWith("/admin") ? (
          <>
            <span>
              <strong className="font-semibold">Maintenance mode is on</strong> until {until} ({formatTimeLeft(status.endsAt, now)} left).
              Customers and the Billing Clerk can&apos;t use the system.
            </span>
            <Link href="/admin/maintenance" className="font-semibold underline underline-offset-4">Manage</Link>
          </>
        ) : (
          <span>
            <strong className="font-semibold">Scheduled maintenance</strong> until {until}. Customer and billing services are unavailable until then.
          </span>
        )}
      </div>
    </div>
  );
}
