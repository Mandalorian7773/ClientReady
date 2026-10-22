import { defineConfig } from "vitest/config";
import path from "node:path";

/** Real Gnani API smoke tests. Spend a few credits; run with `npm run test:integration`. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
