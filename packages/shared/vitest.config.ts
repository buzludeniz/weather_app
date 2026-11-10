import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Vitest 4 removed `coverage.all`; without `include` only files a test
      // imports are reported. Keep Vitest 2's behaviour of reporting all of src.
      include: ["src/**/*.ts"]
    },
    environment: "node"
  }
});
