"use client";

import type { ReactivationDto } from "@/lib/account-closure";
import { LoaderCircle, UserCheck } from "lucide-react";
import { useState } from "react";

/** Shown in place of the sign-in form after a deactivated customer signs in. */
export function ReactivateAccount({ reactivation, onCancel }: { reactivation: ReactivationDto; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstName = reactivation.name.trim().split(/\s+/)[0];

  async function reactivate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json().catch(() => ({}))) as { redirectTo?: string; error?: string };
      if (!response.ok || !payload.redirectTo) {
        setError(payload.error ?? "Your account could not be reactivated. Try again.");
        setBusy(false);
        return;
      }
      // Full page load drops prefetched pages cached before sign-in.
      window.location.assign(payload.redirectTo);
    } catch {
      setError("Unable to reach the server. Try again.");
      setBusy(false);
    }
  }

  function notNow() {
    void fetch("/api/account/reactivate", { method: "DELETE" }).catch(() => undefined);
    onCancel();
  }

  return (
    <div className="flex flex-col gap-5">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-red-700">
        <UserCheck aria-hidden="true" className="h-6 w-6" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight break-words">Welcome back, {firstName}</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Your account was deactivated on {reactivation.deactivatedOn}. It will be deleted on{" "}
          <strong className="text-stone-950">{reactivation.deletesOn}</strong> unless you reactivate it.
        </p>
      </div>
      <p className="rounded-lg bg-stone-50 p-4 text-sm leading-6 text-stone-600">
        Reactivating brings back your Dream House, billing, and schedule exactly as you left them.
      </p>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => void reactivate()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 py-4 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:opacity-60"
        >
          {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <UserCheck aria-hidden="true" className="h-4 w-4" />}
          {busy ? "Reactivating…" : "Reactivate Account"}
        </button>
        <button
          type="button"
          onClick={notNow}
          disabled={busy}
          className="rounded-xl border border-stone-200 bg-white py-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-60"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
