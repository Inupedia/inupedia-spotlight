import { describe, expect, it } from "vitest";
import { composeRunCapabilityPayload } from "../src/remote/runPipeline.js";

describe("v1 run payload capability source", () => {
  it("omits per-run Skills after an accepted Handshake", () => {
    const legacy = { userQuestion: "open", skills: [{ name: "monitoring" }] };
    expect(composeRunCapabilityPayload(legacy, undefined)).toHaveProperty("skills");
    expect(composeRunCapabilityPayload(legacy, { capabilitySnapshotId: "snap", sessionBindingVersion: 1 })).toEqual({
      userQuestion: "open",
      capabilitySnapshotId: "snap",
      sessionBindingVersion: 1,
    });
  });
});
