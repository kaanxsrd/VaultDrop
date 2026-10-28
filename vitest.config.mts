import path from "node:path";
import { defineConfig } from "vitest/config";

const realPostgres = Boolean(process.env.TEST_DATABASE_URL);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    // A shared Postgres database cannot be used by several files at once.
    fileParallelism: !realPostgres,
  },
});
