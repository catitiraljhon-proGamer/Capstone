"use client";

import { Button } from "@/components/ui/button";
import {
  contactFieldLabels,
  contactFields,
  type ContactDetails,
  type ContactDetailsView,
  type ContactField,
} from "@/lib/contact-details";
import { refreshContactDetails } from "@/lib/use-contact-details";
import { Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const field =
  "mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600";

const fieldDetails: Record<ContactField, { icon: LucideIcon; hint: string }> = {
  phone: { icon: Phone, hint: "Tapping it on a phone starts a call." },
  email: { icon: Mail, hint: "Tapping it opens a new email." },
  address: { icon: MapPin, hint: "Opens in Maps for walk-in inquiries." },
};

/** Same rules as the server, so mistakes show before saving. */
function fieldError(name: ContactField, value: string) {
  const text = value.trim();
  if (name === "phone") {
    if (!text) return "Enter the phone number, for example (043) 407 3561.";
    if (!/^\+?[\d\s()-]+$/.test(text)) return "Use only digits, spaces, parentheses, dashes, and a leading +.";
    if (text.replace(/\D/g, "").length < 7) return "Enter at least 7 digits for the phone number.";
    if (text.length > 30) return "Keep the phone number within 30 characters.";
    return null;
  }
  if (name === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "Enter a valid email address.";
    return text.length > 120 ? "Keep the email address within 120 characters." : null;
  }
  if (text.length < 10) return "Enter the full office address.";
  return text.length > 200 ? "Keep the office address within 200 characters." : null;
}

function changedLine(view: ContactDetailsView, name: ContactField) {
  const change = view.changes[name];
  if (!change) return null;
  const date = new Date(change.at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  return `${change.by} · ${date}`;
}

export function AdminMaintenanceContact({ onError, onSuccess }: {
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [view, setView] = useState<ContactDetailsView | null>(null);
  const [draft, setDraft] = useState<ContactDetails | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/contact", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as ContactDetailsView & { error?: string };
        if (!response.ok || !payload.contact) throw new Error(payload.error ?? "Unable to load the contact details.");
        if (!active) return;
        setView(payload);
        setDraft(payload.contact);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        onError(loadError instanceof Error ? loadError.message : "Unable to load the contact details.");
      });
    return () => {
      active = false;
    };
  }, [onError]);

  if (!view || !draft) {
    return <div className={`${panel} text-sm text-stone-500`}>{loadFailed ? "The contact details are unavailable." : "Loading contact details…"}</div>;
  }

  const changed = contactFields.filter((name) => draft[name].trim() !== view.contact[name]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onError(null);
    onSuccess(null);
    const nextErrors: Partial<Record<ContactField, string>> = {};
    for (const name of contactFields) {
      const message = fieldError(name, draft[name]);
      if (message) nextErrors[name] = message;
    }
    setErrors(nextErrors);
    const firstInvalid = contactFields.find((name) => nextErrors[name]);
    if (firstInvalid) {
      document.getElementById(`contact-${firstInvalid}`)?.focus();
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/maintenance/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as ContactDetailsView & { error?: string; issues?: { message?: string }[] };
      if (!response.ok || !payload.contact) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to save the contact details.");
      setView(payload);
      setDraft(payload.contact);
      // Contact Us shows the new details right away wherever it is open.
      refreshContactDetails();
      onSuccess("Contact details saved. Contact Us now shows them to customers and visitors.");
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "Unable to save the contact details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void save(event)} noValidate className={panel}>
      <h2 className="text-base font-semibold tracking-tight">Contact Us Details</h2>
      <p className="mt-1 text-sm text-stone-600">
        Shown when customers or visitors open the Contact Us button, including during maintenance mode.
      </p>
      <div className="mt-3 divide-y divide-stone-200 border-t border-stone-200">
        {contactFields.map((name) => {
          const { icon: Icon, hint } = fieldDetails[name];
          const id = `contact-${name}`;
          const error = errors[name];
          const changedBy = changedLine(view, name);
          const props = {
            id,
            value: draft[name],
            "aria-invalid": error ? true : undefined,
            "aria-describedby": `${id}-hint${error ? ` ${id}-error` : ""}`,
            className: field,
            onChange: (event: { target: { value: string } }) => {
              setDraft({ ...draft, [name]: event.target.value });
              setErrors((current) => ({ ...current, [name]: undefined }));
              onSuccess(null);
            },
          };
          return (
            <div key={name} className="py-4">
              <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-stone-950">
                <Icon className="h-4 w-4 text-red-700" aria-hidden="true" />
                {contactFieldLabels[name]}
              </label>
              <p id={`${id}-hint`} className="mt-0.5 text-sm text-stone-600">{hint}</p>
              {changedBy ? <p className="mt-0.5 text-xs text-stone-500">{changedBy}</p> : null}
              {name === "address" ? (
                <textarea {...props} rows={2} maxLength={200} />
              ) : (
                <input {...props} type={name === "email" ? "email" : "tel"} maxLength={name === "email" ? 120 : 30} autoComplete="off" />
              )}
              {error ? <p id={`${id}-error`} className="mt-1.5 text-sm text-red-700">{error}</p> : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
        <Button type="submit" disabled={isSaving || !changed.length}>
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSaving || !changed.length}
          onClick={() => { setDraft(view.contact); setErrors({}); onError(null); }}
        >
          Discard
        </Button>
        {changed.length ? (
          <p className="text-sm text-stone-600" role="status">
            {changed.length === 1 ? "1 unsaved change" : `${changed.length} unsaved changes`}
          </p>
        ) : null}
      </div>
    </form>
  );
}
