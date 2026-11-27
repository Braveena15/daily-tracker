// Files in MongoDB GridFS, encrypted with AES-256-GCM (DIARY_ENCRYPTION_KEY) before they're stored
// and decrypted only to stream them back to their owner. Used for receipts (bucket "receipts") and
// program progress photos (bucket "programPhotos"). The owner is kept in each file's metadata.
// File contents are never logged.
import { Readable } from "node:stream";
import mongoose, { Types } from "mongoose";
import { fieldCrypto } from "../config/encryption";

export const FILE_BUCKETS = ["receipts", "programPhotos"] as const;
export type FileBucket = (typeof FILE_BUCKETS)[number];

function bucket(name: FileBucket) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("The database isn't connected");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: name });
}

/** Encrypts and stores one file; returns its id. */
export async function storeFile(name: FileBucket, userId: string, bytes: Buffer, filename: string, mimeType: string): Promise<string> {
  const encrypted = fieldCrypto.encryptBytes(bytes);
  const upload = bucket(name).openUploadStream(filename, {
    // The real type and size live here (the stored bytes are encrypted)
    metadata: { userId: new Types.ObjectId(userId), mimeType, size: bytes.length, encrypted: true },
  });
  await new Promise<void>((resolve, reject) => {
    Readable.from([encrypted]).pipe(upload).on("finish", () => resolve()).on("error", reject);
  });
  return String(upload.id);
}

/**
 * The decrypted file, or null when there's no such file. With `userId`, only a file that user owns
 * is returned. Throws if it can't be decrypted.
 */
export async function readFile(name: FileBucket, fileId: string, userId?: string): Promise<Buffer | null> {
  if (!Types.ObjectId.isValid(fileId)) return null;
  const id = new Types.ObjectId(fileId);
  const filter: Record<string, unknown> = { _id: id };
  if (userId) filter["metadata.userId"] = new Types.ObjectId(userId);
  const found = await bucket(name).find(filter).limit(1).toArray();
  if (found.length === 0) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of bucket(name).openDownloadStream(id)) chunks.push(chunk as Buffer);
  return fieldCrypto.decryptBytes(Buffer.concat(chunks));
}

/** Deletes files by id; ids that don't exist (or aren't stored files, like the demo's samples) are skipped. */
export async function deleteFiles(name: FileBucket, fileIds: string[]): Promise<void> {
  for (const fileId of fileIds) {
    if (!Types.ObjectId.isValid(fileId)) continue;
    try {
      await bucket(name).delete(new Types.ObjectId(fileId));
    } catch {
      // Already gone
    }
  }
}

/** Deletes every file the user owns in a bucket; returns how many. */
export async function deleteAllFilesOf(name: FileBucket, userId: string): Promise<number> {
  const db = mongoose.connection.db;
  if (!db) return 0;
  const owner = new Types.ObjectId(userId);
  const ids = await db.collection(`${name}.files`).find({ "metadata.userId": owner }).project({ _id: 1 }).toArray();
  for (const { _id } of ids) {
    try {
      await bucket(name).delete(_id);
    } catch {
      // Already gone
    }
  }
  return ids.length;
}

/** Bytes the user has stored in a bucket (their original sizes). */
export async function bytesUsed(name: FileBucket, userId: string): Promise<number> {
  const db = mongoose.connection.db;
  if (!db) return 0;
  const [row] = await db
    .collection(`${name}.files`)
    .aggregate<{ total: number }>([{ $match: { "metadata.userId": new Types.ObjectId(userId) } }, { $group: { _id: null, total: { $sum: "$metadata.size" } } }])
    .toArray();
  return row?.total ?? 0;
}

/** Receipts and photos together: the storage budget both share. */
export async function totalBytesUsed(userId: string): Promise<number> {
  const sizes = await Promise.all(FILE_BUCKETS.map((b) => bytesUsed(b, userId)));
  return sizes.reduce((s, n) => s + n, 0);
}
