"use client";

import { usePublicSettings } from "@/lib/use-public-settings";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Shared across tabs, so activity in one tab keeps the others signed in too. */
const lastActivityKey = "g4-last-activity";
const signedInAreas = ["/admin", "/billing-clerk", "/customer"];
const activityEvents = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
/** How often the limit is checked; short so a 1-minute limit signs out close to 1 minute, not 1.5. */
const checkEveryMs = 5_000;

function readLastActivity() {
  try {
    return Number(window.localStorage.getItem(lastActivityKey)) || 0;
  } catch {
    return 0;
  }
}

function writeLastActivity(time: number) {
  try {
    window.localStorage.setItem(lastActivityKey, String(time));
  } catch {
    // Private windows may block storage; this tab still tracks its own activity.
  }
}

function clearLastActivity() {
  try {
    window.localStorage.removeItem(lastActivityKey);
  } catch {
    // Nothing stored to clear.
  }
}

/** Signs a signed-in person out after the Admin's set minutes of no activity (Maintenance > Account security). */
export function IdleSignOut() {
  const pathname = usePathname();
  const { idleSignOutMinutes } = usePublicSettings();
  const inSignedInArea = signedInAreas.some((area) => pathname === area || pathname.startsWith(`${area}/`));

  useEffect(() => {
    // Outside the signed-in pages (the login page included), forget the last session's activity so the next
    // sign-in starts counting from zero instead of being signed out at once for idling before the last sign-out.
    if (!inSignedInArea) clearLastActivity();
  }, [inSignedInArea]);

  useEffect(() => {
    if (!inSignedInArea || idleSignOutMinutes <= 0) return;
    const limitMs = idleSignOutMinutes * 60_000;
    let lastActivity = Math.max(readLastActivity(), 0);
    let lastWrite = 0;
    let signingOut = false;

    const signOut = () => {
      if (signingOut) return;
      signingOut = true;
      void fetch("/api/auth/logout", { method: "DELETE" })
        .catch(() => undefined)
        .finally(() => window.location.replace("/login?signed_out=idle"));
    };

    const check = () => {
      lastActivity = Math.max(lastActivity, readLastActivity());
      if (lastActivity && Date.now() - lastActivity >= limitMs) signOut();
    };

    const markActive = () => {
      const now = Date.now();
      lastActivity = now;
      // Writing on every mouse move is wasteful; once every few seconds is plenty.
      if (now - lastWrite > 5_000) {
        lastWrite = now;
        writeLastActivity(now);
      }
    };

    // Coming back after the limit (for example, reopening the laptop) signs out right away.
    check();
    if (!signingOut) markActive();
    for (const event of activityEvents) window.addEventListener(event, markActive, { passive: true });
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, checkEveryMs);
    return () => {
      for (const event of activityEvents) window.removeEventListener(event, markActive);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [inSignedInArea, idleSignOutMinutes]);

  return null;
}
