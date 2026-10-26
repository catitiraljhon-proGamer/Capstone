"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { BillingErrorMessage, billingJson } from "@/components/billing/billing-primitives";
import { Button } from "@/components/ui/button";
import { defaultContactDetails } from "@/lib/contact-details";
import { useContactDetails } from "@/lib/use-contact-details";
import { warrantyDate, warrantyLengthLabel } from "@/lib/warranty";
import type { WarrantyCertificateDto } from "@/types/warranty";

/** The printable warranty certificate of a completed house, for the homeowner and the Admin. */
export function WarrantyCertificate({ projectId, backHref, backLabel }: { projectId: string; backHref: string; backLabel: string }) {
  const [certificate, setCertificate] = useState<WarrantyCertificateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contact = useContactDetails(true) ?? defaultContactDetails;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/construction/projects/${projectId}/warranty-certificate`, { cache: "no-store", signal: controller.signal })
      .then((response) => billingJson<WarrantyCertificateDto>(response))
      .then(setCertificate)
      .catch((loadError: unknown) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load the certificate."); });
    return () => controller.abort();
  }, [projectId]);

  return (
    <main className="billing-document mx-auto max-w-3xl px-5 py-8 text-stone-950">
      <style>{`@media print { .document-toolbar, [data-chat-widget] { display: none !important; } .billing-document { max-width: none; padding: 0; } .document-sheet { border: 0; box-shadow: none; } .document-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 16mm; } }`}</style>
      <div className="document-toolbar mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" asChild><a href={backHref}><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />{backLabel}</a></Button>
        <Button disabled={!certificate} onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" aria-hidden="true" />Print / Save PDF</Button>
      </div>
      <BillingErrorMessage message={error} />
      {!error && !certificate ? <p role="status" className="text-sm text-stone-500">Loading certificate…</p> : null}
      {certificate ? (
        <article className="document-sheet space-y-7 rounded-xl border border-stone-200 bg-white p-6 text-sm shadow-sm sm:p-10">
          <header className="flex flex-wrap items-center justify-between gap-5 border-b-[3px] border-red-700 pb-5">
            <Image src="/G4/image.png" alt="G4 Builders Inc" width={1726} height={500} priority className="h-auto w-48 object-contain" />
            <dl className="text-right text-xs leading-6 text-stone-600">
              <div><dt className="inline">Certificate No. </dt><dd className="inline font-semibold text-stone-950">{certificate.number}</dd></div>
              <div><dt className="inline">Issued </dt><dd className="inline font-semibold text-stone-950">{warrantyDate(certificate.startsOn)}</dd></div>
            </dl>
          </header>

          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Construction Warranty</p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">Warranty Certificate</h1>
            <p className="mt-3 leading-6 text-stone-700">
              This certifies that the house below was built by G4 Builders Inc and is covered by the warranty in this certificate, counted from the day the project was completed.
            </p>
          </section>

          <dl className="grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-5 sm:grid-cols-2">
            <div><dt className="text-xs text-stone-500">Homeowner</dt><dd className="mt-1 text-base font-semibold">{certificate.customerName}</dd></div>
            <div><dt className="text-xs text-stone-500">Project</dt><dd className="mt-1 text-base font-semibold">{certificate.project.reference} · {certificate.project.name}</dd></div>
            <div><dt className="text-xs text-stone-500">Site Address</dt><dd className="mt-1 text-base font-semibold">{certificate.siteAddress ?? "—"}</dd></div>
            <div><dt className="text-xs text-stone-500">Completed On</dt><dd className="mt-1 text-base font-semibold">{warrantyDate(certificate.startsOn)}</dd></div>
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-left">
              <thead className="bg-red-700 text-xs font-semibold uppercase tracking-wide text-white">
                <tr><th className="px-3 py-2.5">What it covers</th><th className="w-48 px-3 py-2.5">Period</th></tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-200 align-top">
                  <td className="px-3 py-3.5 leading-6">
                    Defects in the work done by G4 Builders Inc{certificate.covers.length ? `: ${certificate.covers.join(", ").toLowerCase()}` : ""}.
                  </td>
                  <td className="px-3 py-3.5">
                    <p className="font-semibold">{warrantyLengthLabel(certificate.months)}</p>
                    <p className="mt-0.5 text-stone-600">{warrantyDate(certificate.startsOn)} – {warrantyDate(certificate.endsOn)}</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h2 className="text-base font-semibold tracking-tight">Not covered</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 leading-6 text-stone-700">
                {certificate.notCovered.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </section>
            <section>
              <h2 className="text-base font-semibold tracking-tight">How to report a problem</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5 leading-6 text-stone-700">
                <li>Log in to your G4 Builders Inc account</li>
                <li>Open Dream House and choose Report a Problem</li>
                <li>G4 Builders inspects it at your house</li>
                <li>Covered problems are repaired for free</li>
              </ol>
            </section>
          </div>

          <div className="grid gap-12 pt-6 sm:grid-cols-2">
            <div><div className="h-12 border-b border-stone-700" /><p className="mt-2 font-semibold">Authorized Representative</p><p className="text-xs text-stone-600">G4 Builders Inc</p></div>
            <div><div className="h-12 border-b border-stone-700" /><p className="mt-2 font-semibold">{certificate.customerName}</p><p className="text-xs text-stone-600">Homeowner</p></div>
          </div>

          <footer className="border-t border-stone-200 pt-4 text-center text-xs leading-6 text-stone-500">
            G4 Builders Inc · {contact.address} · {contact.phone} · {contact.email}
          </footer>
        </article>
      ) : null}
    </main>
  );
}
