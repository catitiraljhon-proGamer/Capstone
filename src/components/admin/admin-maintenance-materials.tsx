"use client";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { PesoInput } from "@/components/ui/peso-input";
import { formatPeso } from "@/lib/house-design-data";
import { type Material, materialNameKey, materialNameMax, materialPriceError } from "@/lib/materials";
import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const inputClass =
  "h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600";
const pageSize = 15;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

function changedLine(material: Material) {
  if (!material.priceChange) return `Added ${shortDate(material.createdAt)}`;
  const { by, at, previousPrice } = material.priceChange;
  return `${by} · ${shortDate(at)} · was ${formatPeso(previousPrice)}`;
}

async function readMaterials(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { materials?: Material[]; error?: string };
  if (!response.ok || !payload.materials) throw new Error(payload.error ?? fallback);
  return payload.materials;
}

/** Maintenance > Materials: the materials staff list in each scope of work, with prices the Admin types in the list. */
export function AdminMaintenanceMaterials({ onError, onSuccess }: {
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /** Typed prices by material id; a price that matches the saved one is not a change. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [addTried, setAddTried] = useState(false);
  const [busy, setBusy] = useState<"add" | "save" | null>(null);
  const [newId, setNewId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/materials", { cache: "no-store" })
      .then((response) => readMaterials(response, "Unable to load the materials."))
      .then((list) => { if (active) setMaterials(list); })
      .catch((loadError: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        onError(loadError instanceof Error ? loadError.message : "Unable to load the materials.");
      });
    return () => {
      active = false;
    };
  }, [onError]);

  const changedIds = useMemo(() => (materials ?? [])
    .filter((material) => material.id in drafts && (drafts[material.id].trim() === "" || Number(drafts[material.id]) !== material.price))
    .map((material) => material.id), [materials, drafts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? (materials ?? []).filter((material) => material.name.toLowerCase().includes(needle)) : materials ?? [];
  }, [materials, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const nameError = (() => {
    const text = name.trim();
    if (!text) return "Enter the material name.";
    if (text.length < 2) return "Material name must be at least 2 characters.";
    if ((materials ?? []).some((material) => materialNameKey(material.name) === materialNameKey(text))) return "This material is already on the list.";
    return null;
  })();
  const priceError = materialPriceError(price);

  async function add() {
    if (busy || !materials) return;
    setAddTried(true);
    if (nameError || priceError) return;
    setBusy("add");
    onError(null);
    onSuccess(null);
    try {
      const response = await fetch("/api/maintenance/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), price: Number(price) }),
      });
      const list = await readMaterials(response, "Unable to add the material.");
      const added = list.find((material) => materialNameKey(material.name) === materialNameKey(name));
      setMaterials(list);
      setNewId(added?.id ?? null);
      setQuery("");
      setPage(Math.ceil(list.length / pageSize) - 1);
      onSuccess(`${name.trim()} was added at ${formatPeso(Number(price))}.`);
      setName("");
      setPrice("");
      setAddTried(false);
    } catch (addError) {
      onError(addError instanceof Error ? addError.message : "Unable to add the material.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (busy || !materials) return;
    const invalid = materials.find((material) => changedIds.includes(material.id) && materialPriceError(drafts[material.id]));
    if (invalid) {
      onSuccess(null);
      onError(`Fix the price of ${invalid.name} before saving: ${materialPriceError(drafts[invalid.id])}`);
      return;
    }
    setBusy("save");
    onError(null);
    onSuccess(null);
    try {
      const response = await fetch("/api/maintenance/materials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: changedIds.map((id) => ({ id, price: Number(drafts[id]) })) }),
      });
      setMaterials(await readMaterials(response, "Unable to save the prices."));
      onSuccess(changedIds.length === 1 ? "Price saved." : `${changedIds.length} prices saved.`);
      setDrafts({});
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "Unable to save the prices.");
    } finally {
      setBusy(null);
    }
  }

  if (!materials) {
    return <div className={`${panel} text-sm text-stone-500`}>{loadFailed ? "The materials are unavailable." : "Loading the materials…"}</div>;
  }

  const shownNameError = addTried ? nameError : null;
  const shownPriceError = addTried ? priceError : null;

  return (
    <>
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Materials</h2>
            <p className="mt-1 text-sm text-stone-600">
              Staff pick from this list when they add materials to a scope of works in a cost estimate. Customers see only the material names, never the prices or quantities.
            </p>
          </div>
          <span className="whitespace-nowrap rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-red-700">{materials.length} materials</span>
        </div>

        <form
          noValidate
          className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
          onSubmit={(event) => { event.preventDefault(); void add(); }}
        >
          <p className="text-sm font-semibold">Add a material</p>
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-[3_1_16rem]">
              <label htmlFor="material-name" className="text-sm font-medium">Material name <span className="text-red-700">*</span></label>
              <input
                id="material-name"
                maxLength={materialNameMax}
                placeholder="Enter material name"
                className={`${inputClass} mt-1.5`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={shownNameError ? true : undefined}
                aria-describedby={shownNameError ? "material-name-error" : undefined}
              />
              <FieldError id="material-name-error" message={shownNameError} />
            </div>
            <div className="min-w-0 flex-[1_1_11rem]">
              <label htmlFor="material-price" className="text-sm font-medium">Price <span className="text-red-700">*</span></label>
              <PesoInput
                id="material-price"
                min="0"
                step="0.01"
                placeholder="Enter price"
                wrapperClassName="mt-1.5"
                className="h-11 text-right"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                aria-invalid={shownPriceError ? true : undefined}
                aria-describedby={shownPriceError ? "material-price-error" : undefined}
              />
              <FieldError id="material-price-error" message={shownPriceError} />
            </div>
            <div className="pt-0 sm:pt-[1.625rem]">
              <Button type="submit" className="h-11" disabled={Boolean(busy)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {busy === "add" ? "Adding…" : "Add Material"}
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-56 max-w-sm flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              aria-label="Search materials"
              placeholder="Search materials"
              className={`${inputClass} pl-9`}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            />
          </div>
          <p className="text-right text-xs text-stone-500">Type a new price in the box, then save. Estimates already sent keep their prices.</p>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              <tr>
                <th scope="col" className="w-12 px-3 py-3 text-right">#</th>
                <th scope="col" className="px-3 py-3">Material</th>
                <th scope="col" className="w-48 px-3 py-3 text-right">Price</th>
                <th scope="col" className="w-64 px-3 py-3">Last Changed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-stone-500">
                    {query.trim() ? `No material matches "${query.trim()}".` : "No materials yet. Add the first one above."}
                  </td>
                </tr>
              ) : null}
              {rows.map((material) => {
                const typed = drafts[material.id] ?? String(material.price);
                const error = materialPriceError(typed);
                const changed = changedIds.includes(material.id);
                const inputId = `material-price-${material.id}`;
                return (
                  <tr key={material.id} className={`align-top ${changed || material.id === newId ? "bg-rose-50" : ""}`}>
                    <td className="px-3 pt-4 text-right tabular-nums text-stone-400">{materials.indexOf(material) + 1}</td>
                    <td className="px-3 pt-4 font-semibold text-stone-950">{material.name}</td>
                    <td className="px-3 py-2">
                      <PesoInput
                        id={inputId}
                        min="0"
                        step="0.01"
                        aria-label={`Price of ${material.name}`}
                        className={`h-10 text-right font-semibold ${changed && !error ? "border-rose-300" : ""}`}
                        value={typed}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDrafts((currentDrafts) => ({ ...currentDrafts, [material.id]: value }));
                          onSuccess(null);
                        }}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${inputId}-error` : undefined}
                      />
                      <div className="text-right"><FieldError id={`${inputId}-error`} message={error} /></div>
                    </td>
                    <td className={`px-3 pt-4 text-xs ${changed ? "font-medium text-red-800" : "text-stone-500"}`}>
                      {changed ? `Not saved yet · was ${formatPeso(material.price)}` : changedLine(material)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600">
            {filtered.length ? `Showing ${current * pageSize + 1}–${current * pageSize + rows.length} of ${filtered.length}` : "Showing 0 of 0"}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
            <span className="text-sm tabular-nums text-stone-600">Page {current + 1} of {pages}</span>
            <Button type="button" variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button>
          </div>
        </div>
      </section>

      {changedIds.length ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mr-auto text-sm text-stone-600" role="status">
            {changedIds.length === 1 ? "1 unsaved change" : `${changedIds.length} unsaved changes`}
          </p>
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => { setDrafts({}); onError(null); }}>
            Discard
          </Button>
          <Button type="button" disabled={Boolean(busy)} onClick={() => void save()}>
            {busy === "save" ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
