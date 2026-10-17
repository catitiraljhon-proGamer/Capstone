"use client";

import { Button } from "@/components/ui/button";
import { manilaDate } from "@/lib/billing";
import { embeddedImageAccept, readEmbeddedImage } from "@/lib/client-image-upload";
import type { FinishRecord, HouseTypeRecord, MaintenanceData, MaintenanceKind } from "@/types/maintenance";
import { ArrowDown, ArrowUp, DatabaseBackup, Download, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type Tab = "Finishes" | "House Types" | "Backup";
type Save = (body: Record<string, unknown>, message: string) => Promise<boolean>;

const tabs: Tab[] = ["Finishes", "House Types", "Backup"];
const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const field = "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-normal text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";
const label = "block text-sm font-medium text-stone-700";

export function AdminMaintenance() {
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [tab, setTab] = useState<Tab>("Finishes");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as MaintenanceData & { error?: string };
        if (!response.ok || !payload.finishes) throw new Error(payload.error ?? "Unable to load maintenance records.");
        if (active) setData(payload);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load maintenance records.");
      });
    return () => {
      active = false;
    };
  }, []);

  const save: Save = async (body, message) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => ({}))) as MaintenanceData & { error?: string };
      if (!response.ok || !payload.finishes) throw new Error(payload.error ?? "Unable to save the change.");
      setData(payload);
      if (message) setSuccess(message);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the change.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };
  const move = (kind: MaintenanceKind, id: string, direction: "up" | "down") => void save({ action: "move", kind, id, direction }, "");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Maintenance sections">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => { setTab(name); setError(null); setSuccess(null); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === name ? "bg-red-700 text-white" : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-100"}`}
          >
            {name}
          </button>
        ))}
      </div>

      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

      {tab === "Backup" ? <BackupPanel onError={setError} /> : !data ? (
        <div className={`${panel} text-sm text-stone-500`}>{error ? "Maintenance records are unavailable." : "Loading maintenance records…"}</div>
      ) : tab === "Finishes" ? (
        <FinishesPanel records={data.finishes} save={save} move={move} isSaving={isSaving} />
      ) : (
        <HouseTypesPanel records={data.houseTypes} save={save} move={move} isSaving={isSaving} onError={setError} />
      )}
    </div>
  );
}

type PanelProps<T> = { records: T[]; save: Save; move: (kind: MaintenanceKind, id: string, direction: "up" | "down") => void; isSaving: boolean };

function SectionHeader({ title, description, onAdd, addLabel }: { title: string; description: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">{description}</p>
      </div>
      <Button type="button" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />{addLabel}</Button>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return active
    ? <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Active</span>
    : <span className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-600">Inactive</span>;
}

function RowActions({ index, count, onMove, onEdit, name, disabled }: {
  index: number; count: number; onMove: (direction: "up" | "down") => void; onEdit: () => void; name: string; disabled: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" size="sm" variant="ghost" disabled={disabled || index === 0} onClick={() => onMove("up")} aria-label={`Move ${name} up`}><ArrowUp className="h-4 w-4" /></Button>
      <Button type="button" size="sm" variant="ghost" disabled={disabled || index === count - 1} onClick={() => onMove("down")} aria-label={`Move ${name} down`}><ArrowDown className="h-4 w-4" /></Button>
      <Button type="button" size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
    </div>
  );
}

function EditorPanel({ title, onClose, onSubmit, isSaving, children }: { title: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; isSaving: boolean; children: ReactNode }) {
  return (
    <form onSubmit={onSubmit} className="mb-5 rounded-xl border border-rose-200 bg-rose-50/40 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100" aria-label="Close form"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-4">{children}</div>
      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

function ActiveToggle({ checked, onChange, hint }: { checked: boolean; onChange: (value: boolean) => void; hint: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-stone-700">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-red-700" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><span className="font-medium">Active</span><span className="block text-xs text-stone-500">{hint}</span></span>
    </label>
  );
}

const designCountLabel = (count: number) => (count === 1 ? "Used by 1 house design" : `Used by ${count} house designs`);

function FinishesPanel({ records, save, move, isSaving }: PanelProps<FinishRecord>) {
  const [editing, setEditing] = useState<FinishRecord | "new" | null>(null);
  const [value, setValue] = useState("");
  const [active, setActive] = useState(true);
  const open = (record: FinishRecord | "new") => {
    setEditing(record);
    setValue(record === "new" ? "" : record.value);
    setActive(record === "new" ? true : record.active);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = editing && editing !== "new" ? editing.id : undefined;
    if (await save({ action: "save-finish", ...(id ? { id } : {}), value, active }, `${value} was saved.`)) setEditing(null);
  };

  return (
    <section className={panel}>
      <SectionHeader title="Finishes" description="Finish levels customers and the Admin choose for house designs and design requests." onAdd={() => open("new")} addLabel="Add Finish" />
      {editing ? (
        <EditorPanel title={editing === "new" ? "New Finish" : `Edit ${editing.value}`} onClose={() => setEditing(null)} onSubmit={submit} isSaving={isSaving}>
          <label className={label}>Finish Name<input required minLength={2} maxLength={40} className={field} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Example: Premium" /></label>
          {editing !== "new" && editing.designCount > 0 ? <p className="text-xs text-stone-500">Renaming also updates the {editing.designCount} house designs that use it.</p> : null}
          <ActiveToggle checked={active} onChange={setActive} hint="Inactive finishes are hidden from new designs and requests. Existing records keep them." />
        </EditorPanel>
      ) : null}
      <ul className="divide-y divide-stone-100">
        {records.map((record, index) => (
          <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{record.value}</p>
              <p className="mt-0.5 text-xs text-stone-500">{designCountLabel(record.designCount)}</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill active={record.active} />
              <RowActions index={index} count={records.length} name={record.value} disabled={isSaving} onMove={(direction) => move("finish", record.id, direction)} onEdit={() => open(record)} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HouseTypesPanel({ records, save, move, isSaving, onError }: PanelProps<HouseTypeRecord> & { onError: (message: string) => void }) {
  const [editing, setEditing] = useState<HouseTypeRecord | "new" | null>(null);
  const [form, setForm] = useState({ heading: "", description: "", imgSrc: "", active: true });
  const open = (record: HouseTypeRecord | "new") => {
    setEditing(record);
    setForm(record === "new" ? { heading: "", description: "", imgSrc: "", active: true } : { heading: record.heading, description: record.description, imgSrc: record.imgSrc, active: record.active });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.imgSrc) return onError("Add an image link or upload an image.");
    const id = editing && editing !== "new" ? editing.id : undefined;
    if (await save({ action: "save-house-type", ...(id ? { id } : {}), ...form }, `${form.heading} was saved.`)) setEditing(null);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imgSrc = await readEmbeddedImage(file);
      setForm((current) => ({ ...current, imgSrc }));
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : "The image could not be read.");
    }
  };

  return (
    <section className={panel}>
      <SectionHeader title="House Types" description="Styles shown to customers when they browse house designs." onAdd={() => open("new")} addLabel="Add House Type" />
      {editing ? (
        <EditorPanel title={editing === "new" ? "New House Type" : `Edit ${editing.heading}`} onClose={() => setEditing(null)} onSubmit={submit} isSaving={isSaving}>
          <label className={label}>Name<input required minLength={2} maxLength={80} className={field} value={form.heading} onChange={(event) => setForm({ ...form, heading: event.target.value })} placeholder="Example: Bungalow" /></label>
          {editing !== "new" && editing.designCount > 0 ? <p className="text-xs text-stone-500">Renaming also updates the {editing.designCount} house designs that use it.</p> : null}
          <label className={label}>Description<textarea required minLength={10} maxLength={400} className={`${field} h-24 py-2`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className={label}>Image Link<input type="url" className={field} value={form.imgSrc.startsWith("data:") ? "" : form.imgSrc} onChange={(event) => setForm({ ...form, imgSrc: event.target.value })} placeholder={form.imgSrc.startsWith("data:") ? "Uploaded image" : "https://"} /></label>
            <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100">
              Upload Image
              <input type="file" accept={embeddedImageAccept} className="sr-only" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
          </div>
          {form.imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- previews may be data URLs or any https host
            <img src={form.imgSrc} alt="" className="h-32 w-56 rounded-lg object-cover ring-1 ring-stone-200" />
          ) : null}
          <ActiveToggle checked={form.active} onChange={(value) => setForm({ ...form, active: value })} hint="Inactive house types are hidden from customers." />
        </EditorPanel>
      ) : null}
      <ul className="divide-y divide-stone-100">
        {records.map((record, index) => (
          <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- images may be data URLs or any https host */}
              <img src={record.imgSrc} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover ring-1 ring-stone-200" />
              <div className="min-w-0">
                <p className="font-semibold">{record.heading}</p>
                <p className="mt-0.5 line-clamp-1 max-w-xl text-sm text-stone-600">{record.description}</p>
                <p className="mt-0.5 text-xs text-stone-500">{designCountLabel(record.designCount)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill active={record.active} />
              <RowActions index={index} count={records.length} name={record.heading} disabled={isSaving} onMove={(direction) => move("house-type", record.id, direction)} onEdit={() => open(record)} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BackupPanel({ onError }: { onError: (message: string) => void }) {
  const [progress, setProgress] = useState<string | null>(null);

  const download = async () => {
    setProgress("Preparing backup…");
    try {
      const read = async <T,>(url: string) => {
        const response = await fetch(url, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "The backup could not be downloaded.");
        return payload;
      };
      const { collections } = await read<{ collections: { name: string; count: number }[] }>("/api/maintenance/backup");
      const backup: Record<string, unknown[]> = {};
      for (const [index, { name }] of collections.entries()) {
        setProgress(`Downloading ${name.replaceAll("_", " ")} (${index + 1} of ${collections.length})…`);
        backup[name] = [];
        let after: string | null = null;
        do {
          const query: string = `/api/maintenance/backup?collection=${encodeURIComponent(name)}${after ? `&after=${after}` : ""}`;
          const page: { documents: unknown[]; next: string | null } = await read(query);
          backup[name].push(...page.documents);
          after = page.next;
        } while (after);
      }
      const file = JSON.stringify({ system: "G4 Builders Inc", createdAt: new Date().toISOString(), format: "MongoDB Extended JSON (canonical)", collections: backup });
      const url = URL.createObjectURL(new Blob([file], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `g4-backup-${manilaDate()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProgress(null);
    } catch (downloadError) {
      setProgress(null);
      onError(downloadError instanceof Error ? downloadError.message : "The backup could not be downloaded.");
    }
  };

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700"><DatabaseBackup className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Database Backup</h2>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Download a copy of every system record (users, projects, estimates, invoices, payments, files, and logs) as one JSON file. Login throttles and sign-up codes are left out.
            </p>
          </div>
        </div>
        <Button type="button" disabled={Boolean(progress)} onClick={() => void download()}><Download className="mr-2 h-4 w-4" />{progress ? "Downloading…" : "Download Backup"}</Button>
      </div>
      {progress ? <p role="status" className="mt-4 text-sm text-stone-600">{progress}</p> : null}
      <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-stone-600">
        <li>The file contains customer details and password hashes. Store it somewhere private and do not share it.</li>
        <li>Each download is recorded in the Audit Logs.</li>
        <li>Restoring is done by a developer with MongoDB tools, so a mistaken upload can never overwrite live data from this page.</li>
      </ul>
    </section>
  );
}
