import { del, get, list, put } from "@vercel/blob";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where saved backups live: a private Vercel Blob store, or a local folder while developing without one. */
export type StoredFile = { pathname: string; size: number; uploadedAt: Date };

export class BackupStorageError extends Error {}

const prefix = "backups/";
/**
 * Inside /.local/, which git ignores; tests point BACKUP_LOCAL_DIR at a temporary folder. Only used without a Blob
 * store (never on Vercel), so the file calls below are excluded from deployment tracing.
 */
const localFolder = () => process.env.BACKUP_LOCAL_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".local", "backups");

function blobStoreConnected() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  if (process.env.VERCEL) {
    throw new BackupStorageError(
      "Backups need a Vercel Blob store. In Vercel, open Storage, create a private Blob store, and connect it to this project.",
    );
  }
  return false;
}

/** Only the names this module writes are accepted, so a request can never reach other files. */
function localPath(pathname: string) {
  const name = pathname.slice(prefix.length);
  if (!pathname.startsWith(prefix) || !/^[\w.-]+$/.test(name)) throw new BackupStorageError("Unknown backup.");
  return path.join(/*turbopackIgnore: true*/ localFolder(), name);
}

export async function saveFile(name: string, data: Buffer) {
  const pathname = `${prefix}${name}`;
  if (blobStoreConnected()) {
    await put(pathname, data, { access: "private", addRandomSuffix: false, contentType: "application/gzip" });
  } else {
    await mkdir(/*turbopackIgnore: true*/ localFolder(), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ localPath(pathname), data);
  }
  return pathname;
}

export async function listFiles(): Promise<StoredFile[]> {
  if (blobStoreConnected()) {
    const files: StoredFile[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor });
      files.push(...page.blobs.map(({ pathname, size, uploadedAt }) => ({ pathname, size, uploadedAt })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return files;
  }
  const names = await readdir(/*turbopackIgnore: true*/ localFolder()).catch(() => [] as string[]);
  return Promise.all(names.map(async (name) => {
    const info = await stat(path.join(/*turbopackIgnore: true*/ localFolder(), name));
    return { pathname: `${prefix}${name}`, size: info.size, uploadedAt: info.mtime };
  }));
}

export async function readFileData(pathname: string): Promise<Buffer> {
  if (!blobStoreConnected()) return readFile(/*turbopackIgnore: true*/ localPath(pathname));
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result?.stream) throw new BackupStorageError("This backup no longer exists. Refresh the list.");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function removeFile(pathname: string) {
  if (blobStoreConnected()) await del(pathname);
  else await rm(/*turbopackIgnore: true*/ localPath(pathname), { force: true });
}
