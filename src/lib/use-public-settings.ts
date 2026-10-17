"use client";

import { defaultPasswordPolicy, type PublicSettings } from "@/lib/system-settings";
import { useEffect, useState } from "react";

const fallback: PublicSettings = { ...defaultPasswordPolicy, idleSignOutMinutes: 0 };
let request: Promise<PublicSettings> | null = null;

function loadPublicSettings() {
  request ??= fetch("/api/settings/public", { cache: "no-store" })
    .then((response) => (response.ok ? (response.json() as Promise<PublicSettings>) : fallback))
    .catch(() => {
      request = null;
      return fallback;
    });
  return request;
}

/** The Admin's password rules and inactivity sign-out time; the defaults apply until they load. */
export function usePublicSettings() {
  const [settings, setSettings] = useState<PublicSettings>(fallback);
  useEffect(() => {
    let active = true;
    void loadPublicSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return settings;
}
