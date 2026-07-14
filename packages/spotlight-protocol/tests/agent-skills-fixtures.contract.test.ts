import { describe, expect, it } from "vitest";
import { AGENT_SKILL_FIXTURES_V1 } from "./fixtures/agentSkills.js";

describe("Agent Skills fixture oracle", () => {
  it("has stable unique fixture ids", () => {
    const ids = AGENT_SKILL_FIXTURES_V1.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers valid, Unicode, schema, collision and limit cases", () => {
    const ids = new Set(AGENT_SKILL_FIXTURES_V1.map((fixture) => fixture.id));
    expect(ids).toEqual(
      new Set([
        "valid-basic",
        "valid-unicode",
        "invalid-frontmatter-missing",
        "invalid-name-directory-mismatch",
        "invalid-unknown-top-level-field",
        "invalid-allowed-tools-comma",
        "invalid-description-limit",
        "invalid-name-collision-a",
        "invalid-name-collision-b",
      ]),
    );
  });

  it("pins precise diagnostics for every invalid case", () => {
    for (const fixture of AGENT_SKILL_FIXTURES_V1) {
      if (fixture.valid) {
        expect(fixture.expectedDiagnosticCodes).toEqual([]);
      } else {
        expect(fixture.expectedDiagnosticCodes.length).toBeGreaterThan(0);
      }
    }
  });
});
