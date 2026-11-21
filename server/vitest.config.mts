import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Tests use the global describe/it/expect instead of importing them from "vitest".
    // On Windows, a terminal opened at "c:\..." (lowercase drive letter) makes an
    // `import ... from "vitest"` load a second copy of Vitest, and every test file
    // fails with "Cannot read properties of undefined (reading 'config')".
    globals: true,
    // Downloads the in-memory MongoDB binary once, before the integration tests (src/demo/*.test.ts)
    globalSetup: ["src/test/globalSetup.ts"],
  },
});
