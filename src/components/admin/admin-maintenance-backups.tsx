"use client";

import { Button } from "@/components/ui/button";
import type { BackupChunk, BackupList, BackupRecord, BackupType } from "@/types/maintenance";
import { AlertTriangle, DatabaseBackup, Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
/** Upload pieces stay under Vercel's 4.5 MB request limit once base64-encoded. */
const uploadChunkBytes = 2_400_000;

const typeBadges: Record<BackupType, { label: string; className: string }> = {
  automatic: { label: "Automatic", className: "bg-stone-100 text-stone-700" },
  manual: { label: "Manual", className: "bg-rose-50 text-red-800" },
  "before-restore": { label: "Before restore", className: "bg-amber-50 text-amber-800" },
  uploaded: { label: "Uploaded", className: "bg-stone-100 text-stone-950" },
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
}

async function readJson<T>(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; issues?: { message?: string }[] };
  if (!response.ok) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? fallback);
  return payload;
}

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(blob);
  });
}

export function AdminMaintenanceBackups({ onError, onSuccess }: { onError: (message: string | null) => void; onSuccess: (message: string | null) => void }) {
  const [list, setList] = useState<BackupList | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<BackupRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchList = async () => readJson<BackupList>(await fetch("/api/maintenance/backups", { cache: "no-store" }), "Unable to load the backups.");
  const load = async () => setList(await fetchList());

  useEffect(() => {
    let active = true;
    fetchList()
      .then((loaded) => {
        if (active) setList(loaded);
      })
      .catch((loadError: unknown) => {
        if (active) onError(loadError instanceof Error ? loadError.message : "Unable to load the backups.");
      });
    return () => {
      active = false;
    };
    // Loads once when the section opens; actions reload the list themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (label: string, task: () => Promise<string>) => {
    setBusy(label);
    onError(null);
    onSuccess(null);
    try {
      onSuccess(await task());
    } catch (taskError) {
      onError(taskError instanceof Error ? taskError.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const backUpNow = () => run("Saving a backup…", async () => {
    await readJson(await fetch("/api/maintenance/backups", { method: "POST" }), "The backup could not be saved.");
    await load();
    return "Backup saved.";
  });

  const download = (record: BackupRecord) => run("Downloading…", async () => {
    const parts: Uint8Array[] = [];
    let chunks = 1;
    for (let index = 0; index < chunks; index += 1) {
      const response = await fetch(`/api/maintenance/backups/${encodeURIComponent(record.id)}?chunk=${index}`, { cache: "no-store" });
      const piece = await readJson<BackupChunk>(response, "The backup could not be downloaded.");
      chunks = piece.chunks;
      parts.push(Uint8Array.from(atob(piece.data), (character) => character.charCodeAt(0)));
    }
    const url = URL.createObjectURL(new Blob(parts as BlobPart[], { type: "application/gzip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `g4-backup-${record.id}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "Backup downloaded. Keep the file somewhere private: it contains client details and password hashes.";
  });

  const remove = (record: BackupRecord) => run("Deleting…", async () => {
    setConfirmDelete(null);
    await readJson(await fetch(`/api/maintenance/backups/${encodeURIComponent(record.id)}`, { method: "DELETE" }), "The backup could not be deleted.");
    await load();
    return "Backup deleted.";
  });

  const upload = (file: File) => run("Uploading…", async () => {
    const uploadId = crypto.randomUUID();
    const total = Math.max(1, Math.ceil(file.size / uploadChunkBytes));
    for (let index = 0; index < total; index += 1) {
      setBusy(`Uploading ${index + 1} of ${total}…`);
      const data = await toBase64(file.slice(index * uploadChunkBytes, (index + 1) * uploadChunkBytes));
      await readJson(await fetch("/api/maintenance/backups/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, index, total, data }),
      }), "The backup file could not be uploaded.");
    }
    await load();
    return "Backup file uploaded. It is in the list below; choose Restore to use it.";
  });

  return (
    <>
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700"><DatabaseBackup className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">Saved backups</h2>
              <p className="mt-1 text-sm text-stone-600">Copies of every record: users, projects, estimates, invoices, payments, files, and logs.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".gz,.json,application/gzip,application/json"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
            <Button type="button" variant="outline" disabled={Boolean(busy) || Boolean(list?.storageError)} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />Upload backup file
            </Button>
            <Button type="button" disabled={Boolean(busy) || Boolean(list?.storageError)} onClick={() => void backUpNow()}>
              <DatabaseBackup className="mr-2 h-4 w-4" aria-hidden="true" />Back up now
            </Button>
          </div>
        </div>

        {busy ? <p role="status" className="mt-4 text-sm text-stone-600">{busy}</p> : null}
        {list?.storageError ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{list.storageError}
          </p>
        ) : null}

        {!list ? (
          <p className="mt-5 text-sm text-stone-500">Loading backups…</p>
        ) : list.backups.length === 0 && !list.storageError ? (
          <div className="mt-5 rounded-lg border border-dashed border-stone-200 p-6 text-center">
            <p className="text-sm font-semibold text-stone-950">Save your first backup</p>
            <p className="mt-1 text-sm text-stone-600">Choose Back up now, or wait for tonight&apos;s automatic backup.</p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
            {list.backups.map((record) => (
              <li key={record.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-950">{formatWhen(record.createdAt)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                    <span className={`rounded-md px-2 py-0.5 font-semibold ${typeBadges[record.type].className}`}>{typeBadges[record.type].label}</span>
                    <span>{formatSize(record.size)}</span>
                    <span>by {record.createdBy}</span>
                  </p>
                </div>
                {confirmDelete === record.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-stone-700">Delete this backup?</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                    <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => void remove(record)}>Delete</Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void download(record)}>
                      <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />Download
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => setRestoring(record)}>
                      <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Restore
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={Boolean(busy)} aria-label={`Delete the backup from ${formatWhen(record.createdAt)}`} onClick={() => setConfirmDelete(record.id)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-stone-500">
          Backups contain client details and password hashes. Login limits and sign-up codes are left out. Every backup, download, and restore is recorded in the Audit Logs.
        </p>
      </section>

      {restoring ? <RestoreDialog record={restoring} onClose={() => setRestoring(null)} /> : null}
    </>
  );
}

function RestoreDialog({ record, onClose }: { record: BackupRecord; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isRestoring) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRestoring, onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError("Enter your password to confirm.");
      passwordRef.current?.focus();
      return;
    }
    setIsRestoring(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/maintenance/backups/${encodeURIComponent(record.id)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }), "The backup could not be restored.");
      // Everyone, including this Admin, was signed out by the restore.
      window.location.replace("/login?signed_out=restore");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "The backup could not be restored.");
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-950/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-title"
        onSubmit={(event) => void submit(event)}
        noValidate
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6"
      >
        <h2 id="restore-title" className="flex items-start gap-2 text-lg font-semibold tracking-tight">
          <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          Restore the backup from {formatWhen(record.createdAt)}?
        </h2>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-stone-600">
          <li>Every record is replaced with this backup. Changes made after it are lost.</li>
          <li>A &quot;Before restore&quot; backup is saved first, so you can undo this.</li>
          <li>Customers and the Billing Clerk see the maintenance screen until it finishes.</li>
          <li>Everyone, including you, is signed out afterwards.</li>
        </ul>
        <label htmlFor="restore-password" className="mt-5 block text-sm font-medium text-stone-700">Enter your password to confirm</label>
        <input
          ref={passwordRef}
          id="restore-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => { setPassword(event.target.value); setError(null); }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "restore-error" : undefined}
          className="mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
        />
        {error ? <p id="restore-error" role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
        {isRestoring ? <p role="status" className="mt-2 text-sm text-stone-600">Restoring… This can take a minute. Keep this page open.</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={isRestoring} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isRestoring}>{isRestoring ? "Restoring…" : "Restore backup"}</Button>
        </div>
      </form>
    </div>
  );
}
