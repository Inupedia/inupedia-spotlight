import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@inupedia/spotlight-client": resolve(
        import.meta.dirname,
        "../spotlight-client/src/index.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.{test,spec}.ts"],
  },
});
