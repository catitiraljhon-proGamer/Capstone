"use client";

import type { SessionUser } from "@/types/domain";
import { clientProfileUpdatedEvent } from "@/lib/client-information";
import { useCallback, useEffect, useState } from "react";

export function useSessionUser() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        setUser(null);
        return;
      }

      const payload = (await response.json()) as { user: SessionUser };
      setUser(payload.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const refreshProfile = () => { void reload(); };
    window.addEventListener(clientProfileUpdatedEvent, refreshProfile);
    return () => window.removeEventListener(clientProfileUpdatedEvent, refreshProfile);
  }, [reload]);

  return { user, isLoading, reload };
}
