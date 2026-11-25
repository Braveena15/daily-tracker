// Receipt files in MongoDB GridFS (bucket "receipts"). Every file is encrypted with AES-256-GCM
// (DIARY_ENCRYPTION_KEY) before it's stored and decrypted only to stream it back to its owner.
// The file's owner is kept in its metadata, for the storage-used total. File contents are never logged.
import { Readable } from "node:stream";
import mongoose, { Types } from "mongoose";
import { fieldCrypto } from "../config/encryption";

const BUCKET = "receipts";

function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("The database isn't connected");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET });
}

/** Encrypts and stores one file; returns its id. */
export async function storeReceipt(userId: string, bytes: Buffer, filename: string, mimeType: string): Promise<string> {
  const encrypted = fieldCrypto.encryptBytes(bytes);
  const upload = bucket().openUploadStream(filename, {
    // The real type and size live here (the stored bytes are encrypted)
    metadata: { userId: new Types.ObjectId(userId), mimeType, size: bytes.length, encrypted: true },
  });
  await new Promise<void>((resolve, reject) => {
    Readable.from([encrypted]).pipe(upload).on("finish", () => resolve()).on("error", reject);
  });
  return String(upload.id);
}

/** The decrypted file, or null when there's no such file. Throws if it can't be decrypted. */
export async function readReceipt(fileId: string): Promise<Buffer | null> {
  if (!Types.ObjectId.isValid(fileId)) return null;
  const id = new Types.ObjectId(fileId);
  const found = await bucket().find({ _id: id }).limit(1).toArray();
  if (found.length === 0) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of bucket().openDownloadStream(id)) chunks.push(chunk as Buffer);
  return fieldCrypto.decryptBytes(Buffer.concat(chunks));
}

/** Deletes files by id; ids that don't exist (or aren't stored files, like the demo's samples) are skipped. */
export async function deleteReceipts(fileIds: string[]): Promise<void> {
  for (const fileId of fileIds) {
    if (!Types.ObjectId.isValid(fileId)) continue;
    try {
      await bucket().delete(new Types.ObjectId(fileId));
    } catch {
      // Already gone
    }
  }
}

/** Bytes of receipts the user has stored (their original sizes). */
export async function receiptBytesUsed(userId: string): Promise<number> {
  const db = mongoose.connection.db;
  if (!db) return 0;
  const [row] = await db
    .collection(`${BUCKET}.files`)
    .aggregate<{ total: number }>([{ $match: { "metadata.userId": new Types.ObjectId(userId) } }, { $group: { _id: null, total: { $sum: "$metadata.size" } } }])
    .toArray();
  return row?.total ?? 0;
}

/** The demo's placeholder receipt (no file is stored for it). */
export function sampleReceiptSvg(label: string): Buffer {
  const safe = label.replace(/[^\w .,'-]/g, "").slice(0, 40);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<rect width="600" height="800" fill="#fbfaf6"/>
<rect x="40" y="40" width="520" height="720" rx="16" fill="#ffffff" stroke="#d9d4c7" stroke-width="2"/>
<text x="300" y="130" font-family="sans-serif" font-size="34" text-anchor="middle" fill="#3b4a3f">Sample receipt</text>
<text x="300" y="180" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#6b6b6b">${safe}</text>
${Array.from({ length: 8 }, (_, i) => `<rect x="90" y="${250 + i * 50}" width="${280 - (i % 3) * 40}" height="14" rx="7" fill="#e7e3d8"/><rect x="430" y="${250 + i * 50}" width="80" height="14" rx="7" fill="#e7e3d8"/>`).join("")}
<text x="300" y="720" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#9a9a9a">Demo placeholder — not a real receipt</text>
</svg>`,
  );
}
