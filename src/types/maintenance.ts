export type BackupType = "automatic" | "manual" | "before-restore" | "uploaded";

/** A saved database backup in Maintenance > Backup. `id` is its file name. */
export type BackupRecord = {
  id: string;
  type: BackupType;
  createdAt: string;
  createdBy: string;
  size: number;
};

export type BackupList = {
  backups: BackupRecord[];
  /** Set when backups cannot be stored yet, for example before a Blob store is connected. */
  storageError: string | null;
};

/** One piece of a saved backup's gzip file, base64-encoded to fit in a response. */
export type BackupChunk = { index: number; chunks: number; data: string };

/** Public maintenance-mode status; `endsAt` is an ISO time while maintenance is on. */
export type MaintenanceModeStatus = {
  active: boolean;
  endsAt: string | null;
  message: string | null;
  startedAt: string | null;
  startedByName: string | null;
};
