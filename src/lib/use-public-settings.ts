"use client";

import { defaultPasswordPolicy, type PublicSettings } from "@/lib/system-settings";
import { useEffect, useState } from "react";

const fallback: PublicSettings = { ...defaultPasswordPolicy, idleSignOutMinutes: 0 };
/** A tab left open re-reads the settings when shown again, at most this often. */
const staleAfterMs = 60_000;
let request: Promise<PublicSettings> | null = null;
let requestedAt = 0;
const listeners = new Set<(settings: PublicSettings) => void>();

function loadPublicSettings(maxAgeMs = Infinity) {
  if (request && Date.now() - requestedAt > maxAgeMs) request = null;
  if (!request) {
    requestedAt = Date.now();
    request = fetch("/api/settings/public", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<PublicSettings>) : fallback))
      .catch(() => {
        request = null;
        return fallback;
      });
  }
  return request;
}

/** Re-reads the settings right away (after the Admin saves them) and updates every component using them. */
export function refreshPublicSettings() {
  void loadPublicSettings(0).then((loaded) => {
    for (const listener of listeners) listener(loaded);
  });
}

/** The Admin's password rules and inactivity sign-out time; the defaults apply until they load. */
export function usePublicSettings() {
  const [settings, setSettings] = useState<PublicSettings>(fallback);
  useEffect(() => {
    let active = true;
    const update = (loaded: PublicSettings) => {
      if (active) setSettings(loaded);
    };
    const refreshWhenShown = () => {
      if (document.visibilityState === "visible") void loadPublicSettings(staleAfterMs).then(update);
    };
    listeners.add(update);
    void loadPublicSettings().then(update);
    document.addEventListener("visibilitychange", refreshWhenShown);
    return () => {
      active = false;
      listeners.delete(update);
      document.removeEventListener("visibilitychange", refreshWhenShown);
    };
  }, []);
  return settings;
}
