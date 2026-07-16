import { describe, expect, it } from "vitest";
import * as runPipeline from "../src/remote/runPipeline.js";
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

  it("freezes the session identity while an asynchronous Handshake is pending", async () => {
    let currentSessionId = "session-before";
    const bindRunSessionIdentity = (
      runPipeline as typeof runPipeline & {
        bindRunSessionIdentity?: <T>(
          readSessionId: () => string,
          connect: (sessionId: string) => Promise<T>,
        ) => Promise<{ sessionId: string; capability: T }>;
      }
    ).bindRunSessionIdentity;

    const result = bindRunSessionIdentity
      ? await bindRunSessionIdentity(
          () => currentSessionId,
          async (sessionId) => {
            currentSessionId = "session-after";
            return { handshakeSessionId: sessionId };
          },
        )
      : { sessionId: "missing", capability: { handshakeSessionId: "missing" } };

    expect(result).toEqual({
      sessionId: "session-before",
      capability: { handshakeSessionId: "session-before" },
    });
  });
});
