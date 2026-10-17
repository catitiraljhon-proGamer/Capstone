"use client";

import type { MaintenanceModeStatus } from "@/types/maintenance";
import { useEffect, useState } from "react";

const pollMs = 60_000;
const tickMs = 30_000;

/**
 * The current maintenance status, re-read every minute, plus a clock that ticks every 30 seconds
 * so countdowns stay fresh. `status` is null until the first read.
 */
export function useMaintenanceMode() {
  const [status, setStatus] = useState<MaintenanceModeStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/maintenance/mode", { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<MaintenanceModeStatus>) : Promise.reject()))
        .then((next) => { if (active) { setStatus(next); setFailed(false); } })
        .catch(() => { if (active) setFailed(true); });
    void load();
    const poll = setInterval(load, pollMs);
    const tick = setInterval(() => setNow(new Date()), tickMs);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  // Between reads, treat maintenance as over once its end time passes.
  const isActive = Boolean(status?.active && status.endsAt && new Date(status.endsAt) > now);
  return { status, isActive, failed, now };
}
