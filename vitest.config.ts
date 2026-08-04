import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/tests/**/*.{test,spec}.ts"],
  },
});
