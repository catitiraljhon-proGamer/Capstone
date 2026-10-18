"use client";

import { defaultContactDetails, type ContactDetails } from "@/lib/contact-details";
import { useEffect, useState } from "react";

let request: Promise<ContactDetails> | null = null;
const listeners = new Set<(contact: ContactDetails) => void>();

function loadContactDetails(fresh = false) {
  if (fresh) request = null;
  if (!request) {
    request = fetch("/api/settings/contact", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ContactDetails>) : defaultContactDetails))
      .catch(() => {
        request = null;
        return defaultContactDetails;
      });
  }
  return request;
}

/** Re-reads the details right away (after the Admin saves them) and updates Contact Us on this page. */
export function refreshContactDetails() {
  void loadContactDetails(true).then((contact) => {
    for (const listener of listeners) listener(contact);
  });
}

/** The office details for Contact Us, loaded the first time `enabled` is true; null while loading. */
export function useContactDetails(enabled: boolean) {
  const [contact, setContact] = useState<ContactDetails | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const update = (loaded: ContactDetails) => {
      if (active) setContact(loaded);
    };
    listeners.add(update);
    void loadContactDetails().then(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, [enabled]);
  return contact;
}
