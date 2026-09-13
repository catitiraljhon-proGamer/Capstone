"use client";

import {
  useNotifications,
  type SystemNotification,
} from "@/lib/customer-notifications";
import { Bell, CheckCheck, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
  } = useNotifications();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const knownNotificationIdsRef = useRef<Set<string> | null>(null);
  const popupTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [popupNotification, setPopupNotification] =
    useState<SystemNotification | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isLoading) return;

    const nextIds = new Set(notifications.map((notification) => notification.id));
    const knownIds = knownNotificationIdsRef.current;

    if (!knownIds) {
      knownNotificationIdsRef.current = nextIds;
      return;
    }

    const newestNotification = notifications.find(
      (notification) => !notification.isRead && !knownIds.has(notification.id),
    );
    knownNotificationIdsRef.current = nextIds;

    if (!newestNotification) return;

    setPopupNotification(newestNotification);
    if (popupTimerRef.current) window.clearTimeout(popupTimerRef.current);
    popupTimerRef.current = window.setTimeout(
      () => setPopupNotification(null),
      7_000,
    );

    if (
      "Notification" in window &&
      window.Notification.permission === "granted"
    ) {
      const browserNotification = new window.Notification(
        newestNotification.title,
        { body: newestNotification.body },
      );
      browserNotification.onclick = () => {
        window.focus();
        void markRead(newestNotification.id);
        if (newestNotification.href) router.push(newestNotification.href);
        browserNotification.close();
      };
    }
  }, [isLoading, markRead, notifications, router]);

  useEffect(
    () => () => {
      if (popupTimerRef.current) window.clearTimeout(popupTimerRef.current);
    },
    [],
  );

  return (
    <>
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          if (
            "Notification" in window &&
            window.Notification.permission === "default"
          ) {
            void window.Notification.requestPermission();
          }
        }}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100"
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notifications`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-700 px-1 text-xs font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-stone-200 bg-white text-stone-950 shadow-xl sm:w-96"
        >
          <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Notifications</h2>
              <p className="mt-0.5 text-xs text-stone-500" aria-live="polite">
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                  : "You are all caught up."}
              </p>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={isMarkingAll}
                onClick={async () => {
                  setIsMarkingAll(true);
                  await markAllRead();
                  setIsMarkingAll(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {isMarkingAll ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {error ? (
              <p role="alert" className="m-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}

            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading notifications…
              </div>
            ) : notifications.length > 0 ? (
              notifications.slice(0, 12).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={async () => {
                    setIsOpen(false);
                    await markRead(notification.id);
                    if (notification.href) router.push(notification.href);
                  }}
                  className={[
                    "relative w-full rounded-lg px-3 py-3 text-left transition hover:bg-stone-50",
                    notification.isRead ? "" : "bg-red-50/70",
                  ].join(" ")}
                >
                  {!notification.isRead ? (
                    <span
                      className="absolute right-3 top-4 h-2 w-2 rounded-full bg-red-700"
                      aria-label="Unread"
                    />
                  ) : null}
                  <p className="pr-5 text-sm font-semibold text-stone-950">
                    {notification.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    {notification.body}
                  </p>
                  <time
                    dateTime={notification.createdAt}
                    className="mt-1.5 block text-xs text-stone-400"
                  >
                    {formatNotificationTime(notification.createdAt)}
                  </time>
                </button>
              ))
            ) : (
              <div className="p-8 text-center">
                <Bell className="mx-auto h-6 w-6 text-stone-300" />
                <p className="mt-2 text-sm font-semibold text-stone-700">
                  No notifications yet
                </p>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  Message replies and system updates will appear here.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
      {popupNotification ? (
        <aside
          role="status"
          aria-live="polite"
          className="fixed right-4 top-20 z-[60] w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-red-100 bg-white p-4 text-stone-950 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-700">
              <Bell className="h-4 w-4" />
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={async () => {
                const notification = popupNotification;
                setPopupNotification(null);
                await markRead(notification.id);
                if (notification.href) router.push(notification.href);
              }}
            >
              <p className="text-sm font-semibold">{popupNotification.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">
                {popupNotification.body}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setPopupNotification(null)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="Dismiss notification popup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}

export const CustomerNotificationBell = NotificationBell;
