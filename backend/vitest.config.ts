import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // Vitest 4 removed `coverage.all`; without `include` only files a test
      // imports are reported. List src explicitly so untested modules still count
      // against the thresholds, as they did under Vitest 2's `all: true` default.
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    environment: "node",
    globals: true
  }
});
