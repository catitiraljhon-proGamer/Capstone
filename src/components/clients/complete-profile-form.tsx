"use client";

import { ClientInformationForm } from "@/components/clients/client-information-form";
import { clientProfileUpdatedEvent, readClientResponse } from "@/lib/client-information";
import type { ClientDto } from "@/types/clients";
import { useRouter } from "next/navigation";

export function CompleteProfileForm({ client }: { client: ClientDto }) {
  const router = useRouter();

  return (
    <ClientInformationForm
      client={client}
      submitLabel="Save and continue"
      onSave={async (input) => {
        await readClientResponse<{ client: ClientDto }>(
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
        );
        window.dispatchEvent(new Event(clientProfileUpdatedEvent));
        router.replace("/customer");
        router.refresh();
      }}
    />
  );
}
