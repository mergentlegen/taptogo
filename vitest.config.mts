import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the React server runtime; unit tests run plain Node.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/stubs/validation-locale.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/schema/**/*.test.ts"],
  },
});
