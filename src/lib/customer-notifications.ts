"use client";

import { useCallback, useEffect, useState } from "react";

export type SystemNotification = {
  id: string;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  isRead: boolean;
};

export const notificationStatusEvent = "g4:notification-status-changed";

type MarkReadInput =
  | { notificationId: string }
  | { href: string }
  | { all: true };

export async function markNotificationsRead(input: MarkReadInput) {
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (response.ok) {
    window.dispatchEvent(new Event(notificationStatusEvent));
  }

  return response.ok;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = (await response.json()) as {
        notifications?: SystemNotification[];
        unreadCount?: number;
        error?: string;
      };

      if (
        !response.ok ||
        !payload.notifications ||
        typeof payload.unreadCount !== "number"
      ) {
        throw new Error(payload.error ?? "Unable to load notifications.");
      }

      setNotifications(payload.notifications);
      setUnreadCount(payload.unreadCount);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load notifications.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 3_000);
    const handleRefresh = () => void refresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("focus", handleRefresh);
    window.addEventListener(notificationStatusEvent, handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener(notificationStatusEvent, handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  const markRead = useCallback(async (notificationId: string) => {
    const wasUnread = notifications.some(
      (notification) =>
        notification.id === notificationId && !notification.isRead,
    );
    const marked = await markNotificationsRead({ notificationId });
    if (marked) {
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, isRead: true }
            : notification,
        ),
      );
      if (wasUnread) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
    }
    return marked;
  }, [notifications]);

  const markAllRead = useCallback(async () => {
    const marked = await markNotificationsRead({ all: true });
    if (marked) {
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, isRead: true })),
      );
      setUnreadCount(0);
    }
    return marked;
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markRead,
    markAllRead,
  };
}

export type CustomerNotification = SystemNotification;
export const customerNotificationStatusEvent = notificationStatusEvent;
export const markCustomerNotificationsRead = markNotificationsRead;
export const useCustomerNotifications = useNotifications;
