import { describe, expect, it } from "vitest";
import { transformSpotlightAgentIoc } from "../src/vite/spotlightAgentIoc.js";

const FILE = "/src/service/agent/capabilities/panels/construction.ts";

function transform(source: string, fileId = FILE) {
  const result = transformSpotlightAgentIoc(source, fileId);
  expect(result).not.toBeNull();
  return result!.code;
}

describe("@inupedia/spotlight-client/vite AST transform", () => {
  it("strips @agent and injects resolveAgentMeta with file path", () => {
    const out = transform(`
@agent({ name: "panel.openCadViewer", description: "cad", rollback: () => {} })
export async function openCadViewer() {}
`);
    expect(out).toContain("resolveAgentMeta");
    expect(out).toContain(JSON.stringify(FILE));
    expect(out).not.toContain("@agent(");
    expect(out).toContain("registerAgentCapability");
  });

  it("handles multiline meta objects", () => {
    const out = transform(`
@agent({
  name: "panel.openCadViewer",
  description: "cad",
  host: {
    type: "panel.open",
    target: "cadViewer",
  },
})
export async function openCadViewer() {}
`);
    expect(out).toContain("panel.openCadViewer");
    expect(out).toContain("registerAgentCapability(resolveAgentMeta");
  });

  it("handles generic function declarations", () => {
    const out = transform(`
@agent({ name: "navigate.switchMainTab", description: "tab" })
export async function navigateSwitchMainTab<T extends { tab: string }>(input: T) {
  return input;
}
`);
    expect(out).toContain("navigateSwitchMainTab");
  });

  it("handles default export function", () => {
    const out = transform(
      `
@agent({ name: "demo.ping", description: "ping" })
export default async function demoPing() {}
`,
      "capabilities/demo.ts",
    );
    expect(out).toContain("demoPing");
  });

  it("preserves code after comments between decorator and function", () => {
    const out = transform(`
/** capability */
@agent({ name: "panel.openCadViewer", description: "cad" })
// inline note
export async function openCadViewer() {}
`);
    expect(out).toContain("inline note");
    expect(out).toContain("openCadViewer");
  });

  it("returns source map metadata", () => {
    const result = transformSpotlightAgentIoc(
      `@agent({ name: "x", description: "y" })
export async function x() {}`,
      FILE,
    );
    expect(result?.map).toBeTruthy();
    expect(result?.map?.sources).toContain(FILE);
  });

  it("strips @agent on const export", () => {
    const out = transform(`
@agent({ name: "demo.openDoor", description: "door", host: { type: "door.open" } })
export const openDoor = async function openDoor() {};
`);
    expect(out).toContain("registerAgentCapability");
    expect(out).toContain("export const openDoor");
  });
});
