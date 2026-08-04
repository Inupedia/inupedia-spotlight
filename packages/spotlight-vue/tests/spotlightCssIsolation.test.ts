import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = process.cwd().endsWith("packages/spotlight-vue")
  ? process.cwd()
  : resolve(process.cwd(), "packages/spotlight-vue");
const thinkingStyles = readFileSync(
  resolve(packageRoot, "src/styles/spotlight-thinking.css"),
  "utf8",
);

describe("Spotlight style isolation", () => {
  it("does not size the reusable panel with host-controlled rem units", () => {
    expect(thinkingStyles).not.toMatch(/\d(?:\.\d+)?rem\b/u);
  });

  it("keeps the memory refresh action on one line", () => {
    expect(thinkingStyles).toMatch(
      /\.thinking-bar-memory-refresh\s*\{[\s\S]*?white-space:\s*nowrap;/u,
    );
  });
});
