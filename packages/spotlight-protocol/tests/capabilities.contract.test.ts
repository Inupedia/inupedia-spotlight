import { describe, expect, it } from "vitest";
import {
  CAPABILITY_ERROR_CODES_V1,
  SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
  TOOL_TIERS_V1,
  deriveToolTier,
  isToolTierReplaySafe,
  toolTierRank,
  type FrontendToolDescriptorV1,
} from "../src/capabilities.js";

function descriptor(
  overrides: Partial<FrontendToolDescriptorV1>,
): FrontendToolDescriptorV1 {
  return {
    name: "video.open",
    version: "1.0.0",
    description: "Open the video panel",
    inputSchema: { type: "object" },
    sideEffect: "ui",
    replayPolicy: "never",
    ...overrides,
  };
}

describe("spotlight.capabilities/1 wire contract", () => {
  it("freezes the protocol version", () => {
    expect(SPOTLIGHT_CAPABILITY_PROTOCOL_V1).toBe("spotlight.capabilities/1");
  });

  it("only advertises error codes the runtime can actually emit", () => {
    expect(CAPABILITY_ERROR_CODES_V1).toContain("HOST_ACTION_TIMEOUT");
    expect(CAPABILITY_ERROR_CODES_V1).toContain("TOOL_TIER_UNSUPPORTED");
    // Deferred to docs/design/capability-protocol-v2.md until a mutate tier exists.
    expect(CAPABILITY_ERROR_CODES_V1).not.toContain("UNKNOWN_OUTCOME");
    expect(CAPABILITY_ERROR_CODES_V1).not.toContain("CAPABILITY_LEASE_FENCED");
  });

  it("orders tiers by the guarantee the runtime must provide", () => {
    expect([...TOOL_TIERS_V1]).toEqual([
      "observe",
      "query",
      "navigate",
      "mutate",
    ]);
    expect(toolTierRank("observe")).toBeLessThan(toolTierRank("mutate"));
  });

  it("treats everything below mutate as replay-safe", () => {
    expect(isToolTierReplaySafe("observe")).toBe(true);
    expect(isToolTierReplaySafe("query")).toBe(true);
    expect(isToolTierReplaySafe("navigate")).toBe(true);
    expect(isToolTierReplaySafe("mutate")).toBe(false);
  });

  it("prefers an explicit tier over the legacy fields", () => {
    expect(
      deriveToolTier(descriptor({ tier: "observe", sideEffect: "external" })),
    ).toBe("observe");
  });

  it("derives a tier for manifests built before tiers existed", () => {
    expect(
      deriveToolTier(descriptor({ sideEffect: "none", replayPolicy: "safe" })),
    ).toBe("query");
    expect(deriveToolTier(descriptor({ sideEffect: "ui" }))).toBe("navigate");
    expect(deriveToolTier(descriptor({ sideEffect: "external" }))).toBe(
      "mutate",
    );
  });

  it("escalates high risk and confirmation-gated tools to mutate", () => {
    expect(deriveToolTier(descriptor({ riskLevel: "high" }))).toBe("mutate");
    expect(deriveToolTier(descriptor({ requiresConfirmation: true }))).toBe(
      "mutate",
    );
  });
});
