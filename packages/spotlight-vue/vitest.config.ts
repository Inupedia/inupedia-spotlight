import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue()],
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
