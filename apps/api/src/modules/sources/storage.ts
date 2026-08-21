import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../env.js';

/**
 * Raw sources are immutable (§7.1), so the storage key is content-addressed:
 * the same bytes always land at the same key, and nothing can overwrite an
 * existing object in place.
 *
 * The local driver is for development. Production uses S3-compatible encrypted
 * storage per §15.1; the interface below is what the S3 driver will implement.
 */
export interface StoredObject {
  storageKey: string;
  checksum: string;
  byteSize: number;
}

export async function storeObject(projectId: string, filename: string, bytes: Buffer): Promise<StoredObject> {
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const ext = path.extname(filename).slice(0, 12);
  const storageKey = `${projectId}/${checksum}${ext}`;

  if (env.STORAGE_DRIVER === 'local') {
    const target = path.join(env.STORAGE_LOCAL_PATH, storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  } else {
    throw new Error('S3 storage driver is not implemented yet — set STORAGE_DRIVER=local');
  }

  return { storageKey, checksum, byteSize: bytes.byteLength };
}

export async function readObject(storageKey: string): Promise<Buffer> {
  if (env.STORAGE_DRIVER !== 'local') {
    throw new Error('S3 storage driver is not implemented yet');
  }
  // Reject any key that tries to climb out of the storage root.
  const root = path.resolve(env.STORAGE_LOCAL_PATH);
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(root + path.sep)) throw new Error('Invalid storage key');
  return readFile(target);
}
