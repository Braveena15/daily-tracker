// Receipt files: encrypted in GridFS bucket "receipts" (see services/encryptedFiles.ts).
import { bytesUsed, deleteFiles, readFile, storeFile } from "./encryptedFiles";

/** Encrypts and stores one file; returns its id. */
export const storeReceipt = (userId: string, bytes: Buffer, filename: string, mimeType: string): Promise<string> =>
  storeFile("receipts", userId, bytes, filename, mimeType);

/** The decrypted file, or null when there's no such file. Throws if it can't be decrypted. */
export const readReceipt = (fileId: string): Promise<Buffer | null> => readFile("receipts", fileId);

/** Deletes files by id; ids that don't exist (or aren't stored files, like the demo's samples) are skipped. */
export const deleteReceipts = (fileIds: string[]): Promise<void> => deleteFiles("receipts", fileIds);

/** Bytes of receipts the user has stored (their original sizes). */
export const receiptBytesUsed = (userId: string): Promise<number> => bytesUsed("receipts", userId);

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
