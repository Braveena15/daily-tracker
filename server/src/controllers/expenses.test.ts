/// <reference types="vitest/globals" />
// Expenses and receipts end to end, against a real (in-memory) MongoDB: amounts, dates, uploads
// (types, sizes, counts), files encrypted at rest and only ever sent to their owner, the summary,
// and deleting an expense removing its files.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let today: string;
let alice: string;
let bob: string;

// The smallest files the server will accept as a PNG and a PDF (it checks the real bytes)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("SECRET_PNG_BODY".repeat(20))]);
const PDF = Buffer.from("%PDF-1.4\nSECRET_PDF_BODY\n%%EOF");

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  await h.request("POST", "/api/auth/register", { name: "Alice", email: "alice@example.com", password: "password-123" });
  alice = h.cookie!;
  await h.request("POST", "/api/auth/register", { name: "Bob", email: "bob@example.com", password: "password-123" });
  bob = h.cookie!;
  h.setCookie(alice);
  today = (await h.request("GET", "/api/entries/today")).body.date;
  await h.request("PUT", "/api/profile", { journeyStartDate: addDays(today, -20) });
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

/** Multipart upload with the current cookie */
async function upload(id: string, files: { name: string; type: string; bytes: Buffer }[]) {
  const form = new FormData();
  for (const f of files) form.append("files", new Blob([new Uint8Array(f.bytes)], { type: f.type }), f.name);
  const res = await fetch(`${h.base}/api/expenses/${id}/receipts`, { method: "POST", headers: { Cookie: h.cookie! }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function download(fileId: string) {
  const res = await fetch(`${h.base}/api/receipts/${fileId}`, { headers: { Cookie: h.cookie! } });
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}

const add = (body: Record<string, unknown>) => h.request("POST", "/api/expenses", { date: today, category: "food", title: "Lunch", amount: 10, ...body });

describe("expenses", () => {
  let lunch: string;

  it("checks amounts: more than 0, at most 2 decimals", async () => {
    for (const amount of [0, -5, 12.345, "12", Number.NaN]) {
      expect((await add({ amount })).status, String(amount)).toBe(400);
    }
    const ok = await add({ amount: 1250.5, title: "Lunch at the corner café", note: "SECRET_NOTE", paymentMethod: "card" });
    expect(ok.status).toBe(201);
    expect(ok.body.expense).toMatchObject({ amount: 1250.5, currency: "LKR", category: "food", title: "Lunch at the corner café", note: "SECRET_NOTE", receipts: [] });
    lunch = ok.body.expense.id;
  });

  it("refuses future days and days before the journey start", async () => {
    expect((await add({ date: addDays(today, 1) })).status).toBe(400);
    expect((await add({ date: addDays(today, -21) })).status).toBe(400);
    expect((await add({ date: addDays(today, -2), category: "transport", title: "Bus", amount: 120 })).status).toBe(201);
  });

  it("stores the title and note encrypted", async () => {
    const raw = await mongoose.connection.db!.collection("expenses").findOne({ _id: new mongoose.Types.ObjectId(lunch) });
    expect(JSON.stringify(raw)).not.toMatch(/corner café|SECRET_NOTE/);
  });

  it("lists by day, by range and by category", async () => {
    expect((await h.request("GET", `/api/expenses?date=${today}`)).body.expenses).toHaveLength(1);
    expect((await h.request("GET", `/api/expenses?from=${addDays(today, -6)}&to=${today}`)).body.expenses).toHaveLength(2);
    expect((await h.request("GET", `/api/expenses?from=${addDays(today, -6)}&to=${today}&category=transport`)).body.expenses).toHaveLength(1);
  });

  it("accepts photos and PDFs (checked by their bytes), up to 5 MB each and 5 per expense", async () => {
    const res = await upload(lunch, [
      { name: "receipt.png", type: "image/png", bytes: PNG },
      { name: "invoice.pdf", type: "application/pdf", bytes: PDF },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.expense.receipts.map((r: { mimeType: string; size: number }) => [r.mimeType, r.size])).toEqual([
      ["image/png", PNG.length],
      ["application/pdf", PDF.length],
    ]);

    const text = await upload(lunch, [{ name: "notes.png", type: "image/png", bytes: Buffer.from("just text, not an image") }]);
    expect(text.status).toBe(400);
    expect(text.body.message).toMatch(/photos .* or PDFs/);
    const big = await upload(lunch, [{ name: "big.pdf", type: "application/pdf", bytes: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]) }]);
    expect(big.status).toBe(400);
    expect(big.body.message).toMatch(/5 MB/);
    const tooMany = await upload(lunch, Array.from({ length: 4 }, (_, i) => ({ name: `r${i}.png`, type: "image/png", bytes: PNG })));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.message).toMatch(/up to 5 receipts/);
  });

  it("stores files encrypted, and sends them back only to their owner", async () => {
    const { expense } = (await h.request("GET", `/api/expenses/${lunch}`)).body;
    const [png, pdf] = expense.receipts;

    // At rest: no readable bytes in GridFS
    const chunks = await mongoose.connection.db!.collection("receipts.chunks").find({}).toArray();
    expect(chunks.length).toBeGreaterThan(0);
    expect(Buffer.concat(chunks.map((c) => Buffer.from(c.data.buffer))).toString("latin1")).not.toMatch(/SECRET_(PNG|PDF)_BODY/);

    // The owner gets the original bytes, never cached
    const mine = await download(png.fileId);
    expect(mine.status).toBe(200);
    expect(mine.bytes.equals(PNG)).toBe(true);
    expect(mine.headers.get("content-type")).toBe("image/png");
    expect(mine.headers.get("cache-control")).toBe("private, no-store");
    expect((await download(pdf.fileId)).bytes.equals(PDF)).toBe(true);

    // Anyone else: as if it didn't exist
    h.setCookie(bob);
    expect((await download(png.fileId)).status).toBe(404);
    expect((await h.request("GET", `/api/expenses/${lunch}`)).status).toBe(404);
    expect((await h.request("DELETE", `/api/expenses/${lunch}`)).status).toBe(404);
    h.setCookie(alice);
    expect((await download("not-a-file")).status).toBe(404);
  });

  it("reports storage used", async () => {
    const res = await h.request("GET", "/api/storage/usage");
    expect(res.body).toMatchObject({ bytesUsed: PNG.length + PDF.length, limitBytes: 500 * 1024 * 1024 });
  });

  it("sums the period per day and category, with the biggest and the period before", async () => {
    await add({ date: addDays(today, -9), category: "bills", title: "Last week's bill", amount: 1000 });
    await h.request("PUT", "/api/expenses/settings", { weeklyBudget: 2000 });
    const res = await h.request("GET", `/api/expenses/summary?from=${addDays(today, -6)}&to=${today}`);
    expect(res.body).toMatchObject({ total: 1370.5, count: 2, currency: "LKR", previous: { total: 1000 }, change: 370.5, changePercent: 37, budget: 2000, budgetUsedPercent: 69 });
    expect(res.body.perDay).toHaveLength(7);
    expect(res.body.perDay.at(-1)).toEqual({ date: today, total: 1250.5, count: 1 });
    expect(res.body.perCategory).toEqual([
      { category: "food", total: 1250.5, count: 1 },
      { category: "transport", total: 120, count: 1 },
    ]);
    expect(res.body.biggest).toMatchObject({ title: "Lunch at the corner café", amount: 1250.5 });

    // The weekly review has the same week's total
    const review = (await h.request("GET", "/api/progress/weekly-review")).body;
    expect(review.metrics.spent).toMatchObject({ value: 1370.5, daysWithData: 2 });
  });

  it("removes a receipt, and deleting an expense deletes all its files", async () => {
    const { expense } = (await h.request("GET", `/api/expenses/${lunch}`)).body;
    const removed = await h.request("DELETE", `/api/expenses/${lunch}/receipts/${expense.receipts[0].fileId}`);
    expect(removed.body.expense.receipts).toHaveLength(1);
    expect((await download(expense.receipts[0].fileId)).status).toBe(404);

    expect((await h.request("DELETE", `/api/expenses/${lunch}`)).status).toBe(200);
    expect(await mongoose.connection.db!.collection("receipts.files").countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection("receipts.chunks").countDocuments()).toBe(0);
    expect((await download(expense.receipts[1].fileId)).status).toBe(404);
  });
});
