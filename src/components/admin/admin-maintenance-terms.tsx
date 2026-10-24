"use client";

import { TermsDialog } from "@/components/customer/terms-dialog";
import { Button } from "@/components/ui/button";
import type { AccountTermsContent, AccountTermsView } from "@/lib/account-terms";
import { termsContentSchema, termsLimits, type TermsContentInput } from "@/lib/account-terms-schema";
import { refreshAccountTerms } from "@/lib/use-account-terms";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const field =
  "mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600";

type Draft = TermsContentInput;
type Section = Draft["sections"][number];
type Case = Draft["cases"]["items"][number];
/** Error messages by field path, such as "sections.2.title". */
type Errors = Record<string, string>;

const pathKey = (path: PropertyKey[]) => path.map(String).join(".");
const fieldId = (key: string) => `terms-${key.replace(/\./g, "-")}`;

function toDraft(terms: AccountTermsContent): Draft {
  return {
    title: terms.title,
    introduction: terms.introduction,
    noticeTitle: terms.noticeTitle,
    notice: terms.notice,
    sections: terms.sections.map((section) => ({ ...section })),
    cases: { ...terms.cases, items: terms.cases.items.map((item) => ({ ...item })) },
    acknowledgment: terms.acknowledgment,
  };
}

function toErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Errors = {};
  for (const issue of issues) errors[pathKey(issue.path)] ??= issue.message;
  return errors;
}

function move<T>(items: T[], index: number, offset: number) {
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(index + offset, 0, item);
  return next;
}

function publishedLine(item: AccountTermsView["versions"][number]) {
  if (!item.publishedAt) return "Built-in text, before any edits in Maintenance";
  const date = new Date(item.publishedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
  return `${item.publishedBy} · ${date}`;
}

export function AdminMaintenanceTerms({ onError, onSuccess }: {
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [view, setView] = useState<AccountTermsView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  /** The terms open in the read-only dialog: the draft or a published version. */
  const [reading, setReading] = useState<AccountTermsContent | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/terms", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as AccountTermsView & { error?: string };
        if (!response.ok || !payload.current) throw new Error(payload.error ?? "Unable to load the Terms and Conditions.");
        if (!active) return;
        setView(payload);
        setDraft(toDraft(payload.current));
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        onError(loadError instanceof Error ? loadError.message : "Unable to load the Terms and Conditions.");
      });
    return () => {
      active = false;
    };
  }, [onError]);

  if (!view || !draft) {
    return <div className={`${panel} text-sm text-stone-500`}>{loadFailed ? "The Terms and Conditions are unavailable." : "Loading the Terms and Conditions…"}</div>;
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(toDraft(view.current));

  const update = (next: Draft, editedKey?: string) => {
    setDraft(next);
    // Moving or removing renumbers the fields, so earlier messages no longer point to the right one.
    setErrors((current) => {
      if (!editedKey) return {};
      const rest = { ...current };
      delete rest[editedKey];
      return rest;
    });
    onSuccess(null);
  };
  const setSection = (index: number, patch: Partial<Section>, key: string) =>
    update({ ...draft, sections: draft.sections.map((section, at) => (at === index ? { ...section, ...patch } : section)) }, key);
  const setCase = (index: number, patch: Partial<Case>, key: string) =>
    update({ ...draft, cases: { ...draft.cases, items: draft.cases.items.map((item, at) => (at === index ? { ...item, ...patch } : item)) } }, key);
  const setCases = (items: Case[]) => update({ ...draft, cases: { ...draft.cases, items } });

  /** A labelled input, or a textarea when `rows` is given; its id comes from the field path so errors can focus it. */
  const textField = (key: string, label: string, value: string, onChange: (value: string) => void, maxLength: number, rows?: number) => {
    const id = fieldId(key);
    const error = errors[key];
    const props = {
      id,
      value,
      maxLength,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${id}-error` : undefined,
      className: field,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    };
    return (
      <div>
        <label htmlFor={id} className="text-sm font-medium text-stone-950">{label}</label>
        {rows ? <textarea {...props} rows={rows} /> : <input {...props} />}
        {error ? <p id={`${id}-error`} className="mt-1.5 text-sm text-red-700">{error}</p> : null}
      </div>
    );
  };

  const viewVersion = async (version: string) => {
    onError(null);
    if (version === view.current.version) return setReading(view.current);
    try {
      const response = await fetch(`/api/maintenance/terms?${new URLSearchParams({ version })}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as AccountTermsContent & { error?: string };
      if (!response.ok || !payload.version) throw new Error(payload.error ?? "Unable to open that version.");
      setReading(payload);
    } catch (viewError) {
      onError(viewError instanceof Error ? viewError.message : "Unable to open that version.");
    }
  };

  const publish = async () => {
    onError(null);
    onSuccess(null);
    const parsed = termsContentSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error.issues));
      const first = pathKey(parsed.error.issues[0].path);
      const target = document.getElementById(fieldId(first));
      if (target) target.focus();
      else onError(parsed.error.issues[0].message);
      return;
    }
    if (!window.confirm("Publish these Terms and Conditions as a new version?\n\nNew customers will agree to this version. Customers who already agreed keep their agreement and are not asked again.")) return;
    setIsPublishing(true);
    try {
      const response = await fetch("/api/maintenance/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json().catch(() => ({}))) as AccountTermsView & {
        error?: string;
        issues?: { path: PropertyKey[]; message: string }[];
      };
      if (!response.ok || !payload.current) {
        if (payload.issues) setErrors(toErrors(payload.issues));
        throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to publish the Terms and Conditions.");
      }
      setView(payload);
      setDraft(toDraft(payload.current));
      setErrors({});
      // Any terms open on this page (such as the home page footer link) show the new version right away.
      refreshAccountTerms();
      onSuccess(`Version ${payload.current.version} published. New customers now agree to this version.`);
    } catch (publishError) {
      onError(publishError instanceof Error ? publishError.message : "Unable to publish the Terms and Conditions.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className={panel}>
        <h2 className="text-base font-semibold tracking-tight">Terms and Conditions</h2>
        <p className="mt-1 text-sm text-stone-600">
          Customers read and agree to these terms when they create an account. Each time you publish, the edited terms
          become a new version. Customers who already agreed keep their agreement and are not asked again.
        </p>
        <p className="mt-3 text-sm text-stone-950">
          Current version <span className="font-semibold">{view.current.version}</span>
          <span className="text-stone-500"> · {publishedLine(view.versions[0])}</span>
        </p>
      </section>

      <EditorPanel title="Title and Introduction" description="Shown at the top of the terms.">
        {textField("title", "Title", draft.title, (title) => update({ ...draft, title }, "title"), termsLimits.title)}
        {textField("introduction", "Introduction", draft.introduction, (introduction) => update({ ...draft, introduction }, "introduction"), termsLimits.introduction, 3)}
      </EditorPanel>

      <EditorPanel title="Notice Box" description="The highlighted box customers see first.">
        {textField("noticeTitle", "Notice title", draft.noticeTitle, (noticeTitle) => update({ ...draft, noticeTitle }, "noticeTitle"), termsLimits.noticeTitle)}
        {textField("notice", "Notice text", draft.notice, (notice) => update({ ...draft, notice }, "notice"), termsLimits.notice, 4)}
      </EditorPanel>

      <EditorPanel title="Sections" description="Numbered in this order. Use the arrows to move a section.">
        {errors.sections ? <p className="text-sm text-red-700">{errors.sections}</p> : null}
        {draft.sections.map((section, index) => (
          <ItemBlock
            key={index}
            label={`Section ${index + 1}`}
            name={section.title || `section ${index + 1}`}
            index={index}
            count={draft.sections.length}
            onMove={(offset) => update({ ...draft, sections: move(draft.sections, index, offset) })}
            onRemove={() => update({ ...draft, sections: draft.sections.filter((_, at) => at !== index) })}
          >
            {textField(`sections.${index}.title`, "Section title", section.title, (title) => setSection(index, { title }, `sections.${index}.title`), termsLimits.sectionTitle)}
            {textField(`sections.${index}.body`, "Section text", section.body, (body) => setSection(index, { body }, `sections.${index}.body`), termsLimits.sectionBody, 4)}
          </ItemBlock>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.sections.length >= termsLimits.sections}
          onClick={() => {
            update({ ...draft, sections: [...draft.sections, { title: "", body: "" }] });
            setTimeout(() => document.getElementById(fieldId(`sections.${draft.sections.length}.title`))?.focus(), 0);
          }}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add Section
        </Button>
      </EditorPanel>

      <EditorPanel title="Examples of Violations" description="Examples of misuse with the law that applies. Remove every example to hide this part.">
        {textField("cases.heading", "Heading", draft.cases.heading, (heading) => update({ ...draft, cases: { ...draft.cases, heading } }, "cases.heading"), termsLimits.casesHeading)}
        {textField("cases.introduction", "Introduction", draft.cases.introduction, (introduction) => update({ ...draft, cases: { ...draft.cases, introduction } }, "cases.introduction"), termsLimits.casesIntroduction, 2)}
        {errors["cases.items"] ? <p className="text-sm text-red-700">{errors["cases.items"]}</p> : null}
        {draft.cases.items.map((item, index) => (
          <ItemBlock
            key={index}
            label={`Case ${index + 1}`}
            name={item.act || `case ${index + 1}`}
            index={index}
            count={draft.cases.items.length}
            onMove={(offset) => setCases(move(draft.cases.items, index, offset))}
            onRemove={() => setCases(draft.cases.items.filter((_, at) => at !== index))}
          >
            {textField(`cases.items.${index}.act`, "What the customer did", item.act, (act) => setCase(index, { act }, `cases.items.${index}.act`), termsLimits.caseText)}
            {textField(`cases.items.${index}.law`, "Law that applies", item.law, (law) => setCase(index, { law }, `cases.items.${index}.law`), termsLimits.caseText, 2)}
            {textField(`cases.items.${index}.consequence`, "What can happen", item.consequence, (consequence) => setCase(index, { consequence }, `cases.items.${index}.consequence`), termsLimits.caseText)}
          </ItemBlock>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.cases.items.length >= termsLimits.cases}
          onClick={() => {
            setCases([...draft.cases.items, { act: "", law: "", consequence: "" }]);
            setTimeout(() => document.getElementById(fieldId(`cases.items.${draft.cases.items.length}.act`))?.focus(), 0);
          }}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add Example
        </Button>
      </EditorPanel>

      <EditorPanel title="Agreement Sentence" description="Shown above the agree button. Customers agree to this sentence.">
        {textField("acknowledgment", "Agreement sentence", draft.acknowledgment, (acknowledgment) => update({ ...draft, acknowledgment }, "acknowledgment"), termsLimits.acknowledgment, 3)}
      </EditorPanel>

      <section className={panel}>
        <h2 className="text-base font-semibold tracking-tight">Published Versions</h2>
        <p className="mt-1 text-sm text-stone-600">
          A published version never changes. Each customer&apos;s agreement keeps the exact text they agreed to in the audit log.
        </p>
        <ul className="mt-3 divide-y divide-stone-200 border-t border-stone-200">
          {view.versions.map((item, index) => (
            <li key={item.version} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-950">
                  Version {item.version}
                  {index === 0 ? <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-rose-200">Current</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">{publishedLine(item)}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void viewVersion(item.version)}>
                <Eye className="mr-2 h-4 w-4" aria-hidden="true" /> View
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {changed ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mr-auto text-sm text-stone-600" role="status">Unsaved changes to the terms</p>
          <Button type="button" variant="outline" disabled={isPublishing} onClick={() => { setDraft(toDraft(view.current)); setErrors({}); onError(null); }}>
            Discard
          </Button>
          <Button type="button" variant="outline" disabled={isPublishing} onClick={() => setReading({ version: "draft (not yet published)", ...draft })}>
            Preview
          </Button>
          <Button type="button" disabled={isPublishing} onClick={() => void publish()}>
            {isPublishing ? "Publishing…" : "Publish New Version"}
          </Button>
        </div>
      ) : null}

      {reading ? (
        <TermsDialog terms={reading} declineLabel="Close" helperText="" onDecline={() => setReading(null)} onClose={() => setReading(null)} />
      ) : null}
    </div>
  );
}

function EditorPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className={panel}>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-stone-600">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** One numbered section or example, with buttons to move it up or down or remove it. */
function ItemBlock({ label, name, index, count, onMove, onRemove, children }: {
  label: string;
  name: string;
  index: number;
  count: number;
  onMove: (offset: number) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-stone-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{label}</p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${name} up`}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${name} down`}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${name}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  );
}
