"use client";

import { ProfessionalPhoto, ProfessionalRoleBadge } from "@/components/landing/professional-photo";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormDialog } from "@/components/ui/form-dialog";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { embeddedImageAccept, readSquarePhoto } from "@/lib/client-image-upload";
import {
  maxProfessionalPhotoBytes,
  professionalPhotoSize,
  professionalRoles,
  type ManagedProfessional,
  type ProfessionalInput,
  type ProfessionalRole,
} from "@/lib/professionals";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-[invalid=true]:border-red-600";
const maxBioLength = 600;

/** Years stay as typed text until saved, so the field can be cleared while editing. */
type FormValues = Omit<ProfessionalInput, "yearsOfExperience"> & { yearsOfExperience: string };
type FormErrors = Partial<Record<"name" | "licenseNumber" | "yearsOfExperience", string>>;
type Editing = { mode: "add" } | { mode: "edit"; professional: ManagedProfessional };

const emptyForm: FormValues = {
  name: "",
  role: "Architect",
  specialization: "",
  licenseNumber: "",
  yearsOfExperience: "",
  bio: "",
  photo: "",
  visible: true,
};

function toFormValues(professional: ManagedProfessional): FormValues {
  return {
    name: professional.name,
    role: professional.role,
    specialization: professional.specialization,
    licenseNumber: professional.licenseNumber,
    yearsOfExperience: professional.yearsOfExperience === null ? "" : String(professional.yearsOfExperience),
    bio: professional.bio,
    photo: professional.photo,
    visible: professional.visible,
  };
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.name.trim().length < 3) errors.name = "Enter the full name with the title, such as Arch. or Engr.";
  if (!/^\d{0,10}$/.test(values.licenseNumber.trim())) errors.licenseNumber = "Enter the PRC license number using digits only, up to 10.";
  const years = values.yearsOfExperience.trim();
  if (years && (!/^\d+$/.test(years) || Number(years) > 70)) errors.yearsOfExperience = "Enter whole years from 0 to 70.";
  return errors;
}

const designCountLabel = (count: number) => `${count} published design${count === 1 ? "" : "s"}`;

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    professionals?: ManagedProfessional[];
    error?: string;
    issues?: { message?: string }[];
  };
  if (!response.ok || !payload.professionals) {
    throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "The change could not be saved.");
  }
  return payload.professionals;
}

export function AdminMaintenanceProfessionals({ onError, onSuccess }: {
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [professionals, setProfessionals] = useState<ManagedProfessional[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/professionals", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { professionals?: ManagedProfessional[]; error?: string };
        if (!response.ok || !payload.professionals) throw new Error(payload.error ?? "Unable to load the architects and engineers.");
        if (active) setProfessionals(payload.professionals);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        onError(loadError instanceof Error ? loadError.message : "Unable to load the architects and engineers.");
      });
    return () => {
      active = false;
    };
  }, [onError]);

  if (!professionals) {
    return <div className={`${panel} text-sm text-stone-500`}>{loadFailed ? "The architects and engineers are unavailable." : "Loading the architects and engineers…"}</div>;
  }

  /** Runs one change; the server answers with the updated list. */
  const run = async (change: () => Promise<ManagedProfessional[]>, message: string) => {
    onError(null);
    onSuccess(null);
    setIsBusy(true);
    try {
      setProfessionals(await change());
      onSuccess(message);
      return true;
    } catch (changeError) {
      onError(changeError instanceof Error ? changeError.message : "The change could not be saved.");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const move = (index: number, offset: number) => {
    const ids = professionals.map((professional) => professional.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + offset, 0, id);
    void run(() => send("/api/maintenance/professionals", "PUT", { ids }), "Order saved. The About Us page lists them in this order.");
  };

  const shownCount = professionals.filter((professional) => professional.visible).length;

  return (
    <div className="space-y-5">
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <h2 className="text-base font-semibold tracking-tight">Architects and Engineers</h2>
            <p className="mt-1 text-sm text-stone-600">
              The people listed on the About Us page, in this order. Hidden people stay here but are left off the page.
              To list a house design under someone, choose them under Designed By when you edit the design.
            </p>
          </div>
          <Button type="button" onClick={() => { onError(null); onSuccess(null); setEditing({ mode: "add" }); }}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Add Person
          </Button>
        </div>
      </section>

      <section className={panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">On the About Us Page</h2>
          <p className="text-sm text-stone-500">{shownCount} of {professionals.length} shown</p>
        </div>
        {professionals.length ? (
          <ol className="mt-3 divide-y divide-stone-200 border-t border-stone-200">
            {professionals.map((professional, index) => (
              <li key={professional.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <ProfessionalPhoto professional={professional} className="h-14 w-14 rounded-lg" initialsClassName="text-base" />
                  {/* On a phone the buttons move to their own line so the name stays readable. */}
                  <div className="min-w-40 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-950">
                      <span className="break-words">{professional.name}</span>
                      <ProfessionalRoleBadge role={professional.role} />
                      {professional.visible ? null : (
                        <span className="inline-flex rounded-md bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700">Hidden</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-600">
                      {[
                        professional.specialization,
                        professional.licenseNumber ? `PRC ${professional.licenseNumber}` : "",
                        professional.yearsOfExperience === null ? "" : `${professional.yearsOfExperience} years`,
                        designCountLabel(professional.designCount),
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" disabled={isBusy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${professional.name} up`}>
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={isBusy || index === professionals.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${professional.name} down`}>
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void run(
                        () => send(`/api/maintenance/professionals/${professional.id}`, "PATCH", { visible: !professional.visible }),
                        professional.visible ? `${professional.name} is now hidden from the About Us page.` : `${professional.name} is now shown on the About Us page.`,
                      )}
                      aria-label={professional.visible ? `Hide ${professional.name} from the About Us page` : `Show ${professional.name} on the About Us page`}
                    >
                      {professional.visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={() => { onError(null); onSuccess(null); setEditing({ mode: "edit", professional }); }} aria-label={`Edit ${professional.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={() => setRemovingId(professional.id)} aria-label={`Remove ${professional.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                {removingId === professional.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
                    <p className="mr-auto min-w-0 text-sm text-red-800">
                      Remove {professional.name}?
                      {professional.designCount ? " Their designs stay, without anyone under Designed By." : ""}
                    </p>
                    <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={() => setRemovingId(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void run(
                        () => send(`/api/maintenance/professionals/${professional.id}`, "DELETE"),
                        `${professional.name} was removed.`,
                      ).then((removed) => { if (removed) setRemovingId(null); })}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            No one is listed yet, so the About Us page leaves this section out. Add an architect or engineer to show it.
          </p>
        )}
      </section>

      {editing ? (
        <ProfessionalForm
          key={editing.mode === "edit" ? editing.professional.id : "add"}
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            // A failed save is shown inside the pop-up, which covers the page's own message area.
            try {
              setProfessionals(editing.mode === "add"
                ? await send("/api/maintenance/professionals", "POST", input)
                : await send(`/api/maintenance/professionals/${editing.professional.id}`, "PATCH", input));
            } catch (saveError) {
              return saveError instanceof Error ? saveError.message : "The change could not be saved.";
            }
            setEditing(null);
            onError(null);
            onSuccess(editing.mode === "edit"
              ? `Changes to ${input.name} were saved.`
              : input.visible ? `${input.name} was added to the About Us page.` : `${input.name} was added and is hidden from the About Us page.`);
            return null;
          }}
        />
      ) : null}
    </div>
  );
}

function ProfessionalForm({ editing, onClose, onSave }: {
  editing: Editing;
  onClose: () => void;
  /** Resolves to the problem when the save failed. */
  onSave: (input: ProfessionalInput) => Promise<string | null>;
}) {
  const [values, setValues] = useState<FormValues>(editing.mode === "edit" ? toFormValues(editing.professional) : emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const set = <Key extends keyof FormValues>(key: Key, value: FormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    try {
      set("photo", await readSquarePhoto(file, professionalPhotoSize, maxProfessionalPhotoBytes));
    } catch (readError) {
      setPhotoError(readError instanceof Error ? readError.message : "The photo could not be read.");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    const firstInvalid = (["name", "licenseNumber", "yearsOfExperience"] as const).find((key) => nextErrors[key]);
    if (firstInvalid) {
      document.getElementById(`professional-${firstInvalid}`)?.focus();
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    const problem = await onSave({
      ...values,
      name: values.name.trim(),
      specialization: values.specialization.trim(),
      licenseNumber: values.licenseNumber.trim(),
      yearsOfExperience: values.yearsOfExperience.trim() ? Number(values.yearsOfExperience) : null,
      bio: values.bio.trim(),
    });
    setSaveError(problem);
    setIsSaving(false);
  };

  const fieldProps = (key: keyof FormErrors) => ({
    id: `professional-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `professional-${key}-error` : undefined,
  });

  return (
    <FormDialog
      title={editing.mode === "add" ? "Add Architect or Engineer" : `Edit ${editing.professional.name}`}
      description="Shown on the About Us page. Only the name and profession are required."
      error={saveError}
      busy={isSaving}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <ProfessionalPhoto professional={values} className="h-24 w-24 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => photoInput.current?.click()}>
                <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {values.photo ? "Change Photo" : "Upload Photo"}
              </Button>
              {values.photo ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => set("photo", "")}>
                  Remove Photo
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-stone-600">JPG, PNG, or WebP. The photo is cropped to a square around its center.</p>
            <FieldError id="professional-photo-error" message={photoError} />
          </div>
          <input
            ref={photoInput}
            type="file"
            accept={embeddedImageAccept}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a photo"
            onChange={(event) => {
              void pickPhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="professional-name" className="text-sm font-medium text-stone-950">
              Full Name With Title <RequiredIndicator />
            </label>
            <input
              {...fieldProps("name")}
              value={values.name}
              maxLength={80}
              onChange={(event) => set("name", event.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
            <FieldError id="professional-name-error" message={errors.name} />
          </div>

          <div>
            <label htmlFor="professional-role" className="text-sm font-medium text-stone-950">
              Profession <RequiredIndicator />
            </label>
            <select
              id="professional-role"
              value={values.role}
              onChange={(event) => set("role", event.target.value as ProfessionalRole)}
              className={`mt-1.5 ${inputClass}`}
            >
              {professionalRoles.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="professional-specialization" className="text-sm font-medium text-stone-950">Specialization</label>
            <input
              id="professional-specialization"
              value={values.specialization}
              maxLength={80}
              onChange={(event) => set("specialization", event.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </div>

          <div>
            <label htmlFor="professional-licenseNumber" className="text-sm font-medium text-stone-950">PRC License Number</label>
            <input
              {...fieldProps("licenseNumber")}
              inputMode="numeric"
              value={values.licenseNumber}
              maxLength={10}
              onChange={(event) => set("licenseNumber", event.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
            <FieldError id="professional-licenseNumber-error" message={errors.licenseNumber} />
          </div>

          <div>
            <label htmlFor="professional-yearsOfExperience" className="text-sm font-medium text-stone-950">Years of Experience</label>
            <input
              {...fieldProps("yearsOfExperience")}
              type="number"
              inputMode="numeric"
              min={0}
              max={70}
              step={1}
              value={values.yearsOfExperience}
              onChange={(event) => set("yearsOfExperience", event.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
            <FieldError id="professional-yearsOfExperience-error" message={errors.yearsOfExperience} />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="professional-bio" className="text-sm font-medium text-stone-950">Short Bio</label>
            <textarea
              id="professional-bio"
              rows={4}
              value={values.bio}
              maxLength={maxBioLength}
              onChange={(event) => set("bio", event.target.value)}
              aria-describedby="professional-bio-count"
              className={`mt-1.5 resize-y ${inputClass}`}
            />
            <p id="professional-bio-count" className="mt-1 text-right text-xs text-stone-500">{values.bio.length} of {maxBioLength} characters</p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={values.visible}
            onChange={(event) => set("visible", event.target.checked)}
            className="h-4 w-4 rounded border-stone-300 accent-red-700"
          />
          Show on the About Us page
        </label>

        <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-4">
          <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : editing.mode === "add" ? "Add Person" : "Save Changes"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
