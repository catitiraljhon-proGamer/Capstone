import { BackupStorageError } from "@/lib/server/backup-storage";
import { MaintenanceError } from "@/lib/server/maintenance";
import { NextResponse } from "next/server";

/** Backup and restore problems the Admin can act on; anything else falls through to apiError. */
export function backupErrorResponse(error: unknown) {
  if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof BackupStorageError) return NextResponse.json({ error: error.message }, { status: 503 });
  return null;
}
