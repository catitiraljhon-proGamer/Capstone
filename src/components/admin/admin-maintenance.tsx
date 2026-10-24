"use client";

import { AdminMaintenanceBackups } from "@/components/admin/admin-maintenance-backups";
import { AdminMaintenanceContact } from "@/components/admin/admin-maintenance-contact";
import { AdminMaintenanceMode } from "@/components/admin/admin-maintenance-mode";
import { AdminMaintenanceTerms } from "@/components/admin/admin-maintenance-terms";
import { Button } from "@/components/ui/button";
import {
  settingFields,
  settingKeys,
  type SettingKey,
  type SystemSettings,
  type SystemSettingsView,
} from "@/lib/system-settings";
import { refreshPublicSettings } from "@/lib/use-public-settings";
import { Bell, DatabaseBackup, Lock, Mail, Phone, ScrollText, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

type Section = "mode" | "security" | "email" | "notifications" | "contact" | "terms" | "backup";
type SettingGroup = { title: string; description?: string; keys: SettingKey[] };

const sections: { id: Section; label: string; icon: LucideIcon; groups: SettingGroup[] }[] = [
  { id: "mode", label: "Maintenance mode", icon: Wrench, groups: [] },
  {
    id: "security", label: "Account security", icon: Lock, groups: [
      { title: "Passwords", description: "Rules for new passwords. Current passwords keep working.", keys: ["passwordMinLength", "passwordLettersAndNumbers", "passwordUpperAndSymbol"] },
      { title: "Sign-in and inactivity", keys: ["loginMaxAttempts", "loginLockMinutes", "idleSignOutMinutes"] },
    ],
  },
  {
    id: "email", label: "Email links and codes", icon: Mail, groups: [
      { title: "Sign-up verification code", description: "The code a new client enters to confirm their Gmail address.", keys: ["signupCodeMinutes", "signupResendSeconds", "signupMaxAttempts"] },
    ],
  },
  {
    id: "notifications", label: "Notifications and reminders", icon: Bell, groups: [
      { title: "Email copies of notifications", description: "Every notification also shows inside the system.", keys: ["emailCopiesAdmin", "emailCopiesBillingClerk", "emailCopiesCustomer"] },
      { title: "Reminders", keys: ["dueReminderDays", "inactiveNoticeDays", "inactiveArchiveDays"] },
    ],
  },
  { id: "contact", label: "Contact Us", icon: Phone, groups: [] },
  { id: "terms", label: "Terms and Conditions", icon: ScrollText, groups: [] },
  {
    id: "backup", label: "Backup", icon: DatabaseBackup, groups: [
      { title: "Automatic backups", description: "Runs every night at 1:00 AM.", keys: ["autoBackup", "keepAutomaticBackups"] },
    ],
  },
];

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";

function changedLine(view: SystemSettingsView, key: SettingKey) {
  const change = view.changes[key];
  if (!change) return null;
  const date = new Date(change.at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  return `${change.by} · ${date}`;
}

export function AdminMaintenance() {
  const [section, setSection] = useState<Section>("mode");
  const [view, setView] = useState<SystemSettingsView | null>(null);
  /** Typed values; numbers stay as text until saved so a field can be cleared while editing. */
  const [draft, setDraft] = useState<Record<SettingKey, string | boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const toDraft = (settings: SystemSettings) =>
    Object.fromEntries(settingKeys.map((key) => [key, typeof settings[key] === "boolean" ? settings[key] : String(settings[key])])) as Record<SettingKey, string | boolean>;

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as SystemSettingsView & { error?: string };
        if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Unable to load the settings.");
        if (!active) return;
        setView(payload);
        setDraft(toDraft(payload.settings));
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load the settings.");
      });
    return () => {
      active = false;
    };
  }, []);

  const changedKeys = view && draft
    ? settingKeys.filter((key) => String(draft[key]) !== String(view.settings[key]))
    : [];

  const save = async () => {
    if (!view || !draft || !changedKeys.length) return;
    setError(null);
    setSuccess(null);
    const body: Partial<Record<SettingKey, number | boolean>> = {};
    for (const key of changedKeys) {
      const field = settingFields[key];
      const value = draft[key];
      if (field.kind === "toggle") {
        body[key] = Boolean(value);
        continue;
      }
      const number = Number(value);
      if (String(value).trim() === "" || !Number.isInteger(number) || number < field.min || number > field.max) {
        setError(`${field.label} must be a whole number from ${field.min} to ${field.max} ${field.unit}.`);
        return;
      }
      body[key] = number;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/maintenance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => ({}))) as SystemSettingsView & { error?: string; issues?: { message?: string }[] };
      if (!response.ok || !payload.settings) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to save the settings.");
      setView(payload);
      setDraft(toDraft(payload.settings));
      // The sign-out time and password rules take effect on this page now, not on the next reload.
      refreshPublicSettings();
      setSuccess(changedKeys.length === 1 ? "Setting saved." : `${changedKeys.length} settings saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const current = sections.find((item) => item.id === section)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Maintenance sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
        {sections.map((item) => {
          const Icon = item.icon;
          const active = item.id === section;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                setSection(item.id);
                setError(null);
                setSuccess(null);
                // On phones the sections scroll sideways; keep the chosen one in view.
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                active ? "bg-rose-50 text-red-800 ring-1 ring-rose-200" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-5">
        {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

        {section === "mode" ? <AdminMaintenanceMode onError={setError} onSuccess={setSuccess} /> : null}

        {current.groups.length ? (
          !view || !draft ? (
            <div className={`${panel} text-sm text-stone-500`}>{error ? "The settings are unavailable." : "Loading settings…"}</div>
          ) : (
            current.groups.map((group) => (
              <section key={group.title} className={panel}>
                <h2 className="text-base font-semibold tracking-tight">{group.title}</h2>
                {group.description ? <p className="mt-1 text-sm text-stone-600">{group.description}</p> : null}
                <div className="mt-3 divide-y divide-stone-200 border-t border-stone-200">
                  {group.keys.map((key) => (
                    <SettingRow
                      key={key}
                      settingKey={key}
                      value={draft[key]}
                      changed={changedLine(view, key)}
                      onChange={(value) => { setDraft({ ...draft, [key]: value }); setSuccess(null); }}
                    />
                  ))}
                </div>
              </section>
            ))
          )
        ) : null}

        {section === "contact" ? <AdminMaintenanceContact onError={setError} onSuccess={setSuccess} /> : null}
        {section === "terms" ? <AdminMaintenanceTerms onError={setError} onSuccess={setSuccess} /> : null}
        {section === "backup" ? <AdminMaintenanceBackups onError={setError} onSuccess={setSuccess} /> : null}

        {changedKeys.length ? (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
            <p className="mr-auto text-sm text-stone-600" role="status">
              {changedKeys.length === 1 ? "1 unsaved change" : `${changedKeys.length} unsaved changes`}
            </p>
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => { if (view) setDraft(toDraft(view.settings)); setError(null); }}>
              Discard
            </Button>
            <Button type="button" disabled={isSaving} onClick={() => void save()}>
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SettingRow({ settingKey, value, changed, onChange }: {
  settingKey: SettingKey;
  value: string | boolean;
  changed: string | null;
  onChange: (value: string | boolean) => void;
}) {
  const field = settingFields[settingKey];
  const id = `setting-${settingKey}`;
  const hintId = field.hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-stone-950">{field.label}</label>
        {field.hint ? <p id={hintId} className="mt-0.5 text-sm text-stone-600">{field.hint}</p> : null}
        {changed ? <p className="mt-0.5 text-xs text-stone-500">{changed}</p> : null}
      </div>
      {field.kind === "toggle" ? (
        <label className="flex cursor-pointer items-center gap-3 justify-self-start sm:justify-self-end">
          <span className="w-7 text-sm text-stone-600">{value ? "On" : "Off"}</span>
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={Boolean(value)}
            aria-describedby={hintId}
            onChange={(event) => onChange(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-6 w-11 rounded-full bg-stone-300 transition peer-checked:bg-red-700 peer-focus-visible:ring-2 peer-focus-visible:ring-red-600 peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
          />
        </label>
      ) : (
        <div className="flex items-center gap-2 justify-self-start sm:justify-self-end">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            step={1}
            value={String(value)}
            aria-describedby={hintId}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-24 rounded-lg border border-stone-200 bg-white px-3 text-right text-sm tabular-nums text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
          />
          <span className="min-w-0 text-sm text-stone-600">{field.unit}</span>
        </div>
      )}
    </div>
  );
}
