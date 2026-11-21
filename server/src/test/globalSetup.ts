// Runs once before any test file: makes sure the MongoDB binary for the in-memory test database
// (test/harness.ts) is downloaded. The first time this can take several minutes; after that it's
// cached (~/.cache/mongodb-binaries). Downloading here, once, stops parallel test files from each
// starting their own download of the same file.
import { MongoBinary } from "mongodb-memory-server-core";

export default async function setup(): Promise<void> {
  await MongoBinary.getPath();
}
