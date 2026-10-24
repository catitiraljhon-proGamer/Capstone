"use client";

import type { AccountTermsContent } from "@/lib/account-terms";
import { useCallback, useEffect, useState } from "react";

let request: Promise<AccountTermsContent> | null = null;
const listeners = new Set<(terms: AccountTermsContent) => void>();

function loadAccountTerms(fresh = false) {
  if (fresh) request = null;
  if (!request) {
    request = fetch("/api/settings/terms", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("The Terms and Conditions could not be loaded.");
        return (await response.json()) as AccountTermsContent;
      })
      .catch((error: unknown) => {
        request = null;
        throw error;
      });
  }
  return request;
}

/** Re-reads the terms right away (after the Admin publishes a version) and updates any terms open on this page. */
export function refreshAccountTerms() {
  loadAccountTerms(true)
    .then((terms) => {
      for (const listener of listeners) listener(terms);
    })
    .catch(() => undefined);
}

/** The current Terms and Conditions, loaded once per page the first time `enabled` is true; null while loading. */
export function useAccountTerms(enabled = true) {
  const [terms, setTerms] = useState<AccountTermsContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const update = (loaded: AccountTermsContent) => {
      if (!active) return;
      setTerms(loaded);
      setFailed(false);
    };
    listeners.add(update);
    loadAccountTerms()
      .then(update)
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, [enabled, attempt]);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((count) => count + 1);
  }, []);
  return { terms, failed, retry };
}
