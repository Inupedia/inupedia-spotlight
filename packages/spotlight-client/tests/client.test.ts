import { describe, expect, it } from "vitest";
import {
  buildClientToolsManifest,
  createSpotlightHostAdapter,
  mergeCommandCatalogs,
  serializeSkillsForRemote,
} from "../src/index.js";
import type { SpotlightCommandCatalog, SpotlightSkill } from "@inupedia/spotlight-protocol";

describe("@inupedia/spotlight-client", () => {
  it("builds host tool manifest from config tools", () => {
    const manifest = buildClientToolsManifest([
      { name: "panel.open", handler: async () => ({ ok: true }) },
    ]);
    expect(manifest).toEqual([
      expect.objectContaining({ name: "panel.open", executionTarget: "host" }),
    ]);
  });

  it("executes registered host tool handler", async () => {
    const adapter = createSpotlightHostAdapter({
      tools: [
        {
          name: "data.echo",
          handler: async ({ input }) => input,
        },
      ],
    });
    const result = await adapter.executeHostTool(
      {
        id: "1",
        name: "data.echo",
        displayName: "Echo",
        input: { q: "hi" },
      },
      { allowedHostNames: new Set(["data.echo"]) },
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ q: "hi" });
  });

  it("strips skill bodies for create-run payload", () => {
    const skills: SpotlightSkill[] = [
      {
        name: "skill.test",
        description: "d",
        skillInstructionBody: "secret",
      },
    ];
    expect(serializeSkillsForRemote(skills)[0]?.skillInstructionBody).toBeUndefined();
  });

  it("merges command catalogs with overlay winning", () => {
    const base: SpotlightCommandCatalog = {
      actions: [{ domain: "nav", action: "open", description: "base" }],
      targets: [{ id: "main", label: "Main" }],
      actionBindings: [],
      scopes: ["a"],
    };
    const overlay: SpotlightCommandCatalog = {
      actions: [{ domain: "nav", action: "open", description: "overlay" }],
      targets: [],
      actionBindings: [],
      scopes: ["b"],
    };
    const merged = mergeCommandCatalogs(base, overlay);
    expect(merged.actions[0]?.description).toBe("overlay");
    expect(merged.scopes).toEqual(expect.arrayContaining(["a", "b"]));
  });
});
