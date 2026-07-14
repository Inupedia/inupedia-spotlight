import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CAPABILITY_ERROR_CODES_V1,
  SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
  type CapabilityHandshakeResultV1,
  type CapabilityOfferV1,
  type HostActionRequestV2,
  type SessionCapabilityBindingV1,
} from "../src/capabilities.js";

const browserTool = {
  target: "browser",
  registryId: "ydjm",
  name: "video.open",
  version: "1.0.0",
} as const;

describe("spotlight.capabilities/1 wire contract", () => {
  it("freezes the version and stable terminal error", () => {
    expect(SPOTLIGHT_CAPABILITY_PROTOCOL_V1).toBe("spotlight.capabilities/1");
    expect(CAPABILITY_ERROR_CODES_V1).toContain("UNKNOWN_OUTCOME");
    expect(CAPABILITY_ERROR_CODES_V1).toContain("CAPABILITY_LEASE_FENCED");
  });

  it("keeps offer and accepted response JSON-safe", () => {
    const offer = {
      protocolVersion: SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
      offerId: "offer-1",
      projectId: "ydjm-construction-map",
      sessionId: "session-1",
      frontendBuildId: "build-1",
      browserInstanceId: "browser-1",
      tabInstanceId: "tab-1",
      capabilityArtifact: {
        digest: "sha256:artifact",
        manifestDigest: "sha256:manifest",
        toolManifestDigest: "sha256:tools",
        byteLength: 1024,
      },
      liveTools: [{ name: "video.open", version: "1.0.0" }],
    } satisfies CapabilityOfferV1;
    const result = {
      status: "accepted",
      handshakeId: "handshake-1",
      capabilitySnapshotId: "snapshot-1",
      sessionBindingVersion: 1,
      leaseId: "lease-1",
      leaseVersion: 1,
      connectionId: "connection-1",
      connectionEpoch: 1,
      leaseExpiresAt: "2026-07-14T00:00:15.000Z",
      capabilityChannelUrl: "wss://spotlight.test/v1/capabilities/channel",
      capabilityChannelToken: "opaque",
      acceptedTools: [browserTool],
      rejectedTools: [],
    } satisfies CapabilityHandshakeResultV1;

    expect(JSON.parse(JSON.stringify({ offer, result }))).toEqual({
      offer,
      result,
    });
  });

  it("requires the full host-action fence", () => {
    const request = {
      type: "host_action_request",
      callId: "call-1",
      attempt: 1,
      inputDigest: "sha256:input",
      sessionId: "session-1",
      capabilitySnapshotId: "snapshot-1",
      leaseId: "lease-1",
      connectionId: "connection-1",
      connectionEpoch: 1,
      tool: browserTool,
      input: { channelId: "camera-1" },
      deadlineAt: "2026-07-14T00:00:30.000Z",
      maxAttempts: 1,
    } satisfies HostActionRequestV2;

    expect(request.connectionEpoch).toBe(1);
    expectTypeOf(request).toMatchTypeOf<HostActionRequestV2>();
    expectTypeOf<SessionCapabilityBindingV1>().not.toBeAny();
  });
});
