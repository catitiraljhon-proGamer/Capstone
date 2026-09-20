"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClientInformationForm } from "@/components/ui/client-information-form";
import { clientProfileUpdatedEvent, readClientResponse } from "@/lib/client-information";
import type { ClientDto } from "@/types/clients";

function useClientProfile() {
  const [client, setClient] = useState<ClientDto | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile", { cache: "no-store", signal: controller.signal })
      .then(readClientResponse<{ client: ClientDto }>)
      .then((payload) => { if (!controller.signal.aborted) setClient(payload.client); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load client information."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return { client, setClient, error, loading, retry: () => { setError(""); setLoading(true); setAttempt((value) => value + 1); } };
}

export function ClientProfileForm() {
  const { client, setClient, error, loading, retry } = useClientProfile();
  const [saved, setSaved] = useState(false);
  if (loading) return <p role="status" className="text-sm text-stone-500">Loading client information…</p>;
  if (error || !client) return <div role="alert" className="space-y-3 text-sm text-red-700"><p>{error || "Client information could not be loaded."}</p><button onClick={retry} className="min-h-11 font-semibold underline">Try again</button></div>;
  return <div className="space-y-5">
    {saved && <p role="status" className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">Your client information has been saved.</p>}
    <ClientInformationForm key={`${client.id}:${client.updatedAt}`} client={client} onSave={async (input) => {
      setSaved(false);
      const payload = await readClientResponse<{ client: ClientDto }>(await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
      setClient(payload.client);
      setSaved(true);
      window.dispatchEvent(new Event(clientProfileUpdatedEvent));
    }} />
  </div>;
}

export function ClientInformationReminder() {
  const { client } = useClientProfile();
  if (!client || client.profileComplete) return null;
  return <section className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div><h2 className="font-semibold text-stone-950">Complete your client information</h2><p className="mt-1 text-sm leading-6 text-stone-600">Add your age, contact number, and address so the G4 Builders team can coordinate your project.</p></div>
    <Link href="/customer/profile" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Complete my profile</Link>
  </section>;
}
