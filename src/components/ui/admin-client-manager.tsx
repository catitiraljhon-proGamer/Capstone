"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Search, Users } from "lucide-react";
import { ClientInformationForm } from "@/components/ui/client-information-form";
import { readClientResponse } from "@/lib/client-information";
import type { ClientDto, ClientListPayload } from "@/types/clients";

const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50";

export function AdminClientManager() {
  const [payload, setPayload] = useState<ClientListPayload>({ clients: [], total: 0, page: 1, pageSize: 12 });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState<ClientDto | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query, page: String(page) });
    fetch(`/api/clients?${params}`, { cache: "no-store", signal: controller.signal })
      .then(readClientResponse<ClientListPayload>)
      .then((data) => { if (!controller.signal.aborted) { setPayload(data); setError(""); } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load clients."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, page, revision]);

  const refresh = () => { setLoading(true); setRevision((value) => value + 1); };
  const closeForm = () => { setCreating(false); setEditing(null); setSuccess(""); };
  const searchClients = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setQuery(search.trim()); setPage(1); setRevision((value) => value + 1);
  };
  const pageCount = Math.max(1, Math.ceil(payload.total / payload.pageSize));

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-xl font-semibold tracking-tight">{creating ? "Add client" : editing ? "Edit client information" : "Client records"}</h1><p className="mt-1 text-sm leading-6 text-stone-600">Personal and contact details for registered clients.</p></div>
      {!creating && !editing && <button type="button" onClick={() => { setCreating(true); setSuccess(""); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"><Plus className="h-4 w-4" />Add client</button>}
    </div>
    {success && <p role="status" className="rounded-lg border border-stone-200 bg-white p-4 text-sm">{success}</p>}
    {creating || editing ? <section className="max-w-3xl rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <ClientInformationForm key={creating ? "new-client" : `${editing!.id}:${editing!.updatedAt}`} creating={creating} client={editing ?? undefined} onCancel={closeForm} onSave={async (input) => {
        const response = await fetch(creating ? "/api/clients" : `/api/clients/${editing!.id}`, {
          method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
        });
        const result = await readClientResponse<{ client: ClientDto }>(response);
        setSuccess(creating ? "Client account and information created." : "Client information saved.");
        if (creating) { setCreating(false); setSearch(""); setQuery(""); setPage(1); }
        else setEditing(result.client);
        refresh();
      }} />
    </section> : <>
      <form onSubmit={searchClients} className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row">
        <label className="min-w-0 flex-1"><span className="sr-only">Search clients</span><input type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, contact number, or address" className="min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-base outline-none focus:border-red-600 sm:text-sm" /></label>
        <button type="submit" disabled={loading} className={actionClass}><Search className="h-4 w-4" />Search</button>
        <button type="button" disabled={loading} onClick={refresh} className={actionClass}>Refresh</button>
      </form>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status" className="text-sm text-stone-500">Loading clients…</p> : !error && payload.clients.length === 0 ?
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center"><Users className="mx-auto h-8 w-8 text-stone-400" /><h2 className="mt-3 font-semibold">{query ? "No matching clients" : "No clients yet"}</h2><p className="mt-2 text-sm text-stone-600">{query ? "Try a different name or contact detail." : "Add a client or have them register for an account."}</p></div> :
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {payload.clients.map((client) => <article key={client.id} className="min-w-0 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 font-semibold break-words text-stone-950">{client.name}</h2><span className="rounded bg-stone-100 px-2 py-1 text-xs text-stone-600">{client.status === "active" ? "Active" : "Disabled"}</span></div>
            <p className="mt-1 text-sm break-all text-stone-500">{client.email}</p>
            <dl className="mt-5 space-y-3 text-sm">
              <div><dt className="text-xs text-stone-500">Age</dt><dd className="mt-1">{client.age === null ? "Not provided" : `${client.age} years`}</dd></div>
              <div><dt className="text-xs text-stone-500">Contact number</dt><dd className="mt-1 break-words">{client.contactNumber || "Not provided"}</dd></div>
              <div><dt className="text-xs text-stone-500">Complete address</dt><dd className="mt-1 whitespace-pre-wrap break-words">{client.address || "Not provided"}</dd></div>
              <div><dt className="text-xs text-stone-500">Occupation</dt><dd className="mt-1 break-words">{client.occupation || "Not provided"}</dd></div>
            </dl>
            {!client.profileComplete && <p className="mt-4 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">Client information is incomplete.</p>}
            <button type="button" onClick={() => { setEditing(client); setSuccess(""); }} className={`${actionClass} mt-5 w-full`}><Pencil className="h-4 w-4" />Edit information<span className="sr-only"> for {client.name}</span></button>
          </article>)}
        </div>}
      {!error && !loading && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
        <p>{payload.total} {payload.total === 1 ? "client" : "clients"} · Page {payload.page} of {pageCount}</p>
        <div className="flex gap-2"><button disabled={payload.page <= 1} onClick={() => { setLoading(true); setPage(payload.page - 1); }} className={actionClass}>Previous</button><button disabled={payload.page >= pageCount} onClick={() => { setLoading(true); setPage(payload.page + 1); }} className={actionClass}>Next</button></div>
      </div>}
    </>}
  </div>;
}
