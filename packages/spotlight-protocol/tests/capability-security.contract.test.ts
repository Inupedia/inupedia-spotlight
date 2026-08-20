import { describe, expect, it } from "vitest";
import {
  CAPABILITY_REDACTED_LOG_KEYS_V1,
  CAPABILITY_SECURITY_LIMITS_V1,
} from "../src/capabilitySecurity.js";

describe("capability security contract", () => {
  it("freezes v1 resource limits", () => {
    expect(CAPABILITY_SECURITY_LIMITS_V1).toEqual({
      maxSkills: 200,
      maxFiles: 2000,
      maxExpandedArtifactBytes: 20 * 1024 * 1024,
      maxSingleFileBytes: 1024 * 1024,
      maxSkillMarkdownBytes: 512 * 1024,
      maxCompressionRatio: 100,
      maxToolOutputBytes: 1024 * 1024,
      maxJsonDepth: 32,
      maxJsonStringBytes: 256 * 1024,
      maxObservedStateBytes: 8 * 1024,
    });
  });

  it("keeps every credential-shaped key out of logs", () => {
    expect(CAPABILITY_REDACTED_LOG_KEYS_V1).toContain("capabilityChannelToken");
    expect(CAPABILITY_REDACTED_LOG_KEYS_V1).toContain("uploadToken");
    expect(CAPABILITY_REDACTED_LOG_KEYS_V1).toContain("resumeToken");
    expect(CAPABILITY_REDACTED_LOG_KEYS_V1).toContain("authorization");
  });
});
