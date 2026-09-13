"use client";

import { useCallback, useEffect, useState } from "react";

export const staffMessageStatusEvent = "g4:staff-message-status-changed";

export function useUnreadStaffMessages(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }

    try {
      const response = await fetch("/api/messages?summary=unread", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        unreadCount?: number;
      };

      if (response.ok && typeof payload.unreadCount === "number") {
        setUnreadCount(payload.unreadCount);
      }
    } catch {
      // Keep navigation usable when the notification refresh is temporarily unavailable.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10_000);
    const handleRefresh = () => void refresh();

    window.addEventListener("focus", handleRefresh);
    window.addEventListener(staffMessageStatusEvent, handleRefresh);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener(staffMessageStatusEvent, handleRefresh);
    };
  }, [enabled, refresh]);

  return { unreadCount, refresh };
}
