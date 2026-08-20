# Capability Protocol v2 — deferred design

**Status: designed, not implemented. Do not treat any of this as existing behaviour.**

These types used to live in `packages/spotlight-protocol/src/capabilities.ts`. Nothing
imported them — no server code, no client code, no Vue code — and the only test that
referenced them asserted that the types round-tripped through `JSON.stringify`. Keeping
unimplemented types in `src/` makes them read like shipped infrastructure, so they were
moved here until there is a reason to build them.

## Trigger condition

Build this when **the first `mutate`-tier capability is registered** — that is, the first
browser or server tool that changes state in an external system.

Until then every capability is `observe` / `query` / `navigate`, all of which are
replay-safe. When a result is lost the runtime simply re-dispatches the same call, so
none of the machinery below buys anything.

`registerCapabilityManifest()` rejects `mutate` at registration time and points here.

## What must exist before a `mutate` tier can be enabled

1. **Identity.** Lease fencing and call-bound approval grants are scoped to
   `tenantId` / `subjectId`. The server currently authenticates with a static shared
   API-key array and has no concept of a user. This is a prerequisite, not a detail.
2. **A duplex channel.** `capabilityChannelUrl` below is a `wss://` endpoint. There is no
   WebSocket server anywhere in the repo; host results come back over
   `POST /v1/runs/:runId/host-results`.
3. **Durable call state.** Fencing and reconciliation need a call ledger that survives a
   process restart. `RunManager` keeps runs in memory.
4. **A reconciliation slot.** `UNKNOWN_OUTCOME` is only resolvable if the capability can
   answer "did call X land?". That is per-tool business logic and there is no place in the
   descriptor to declare it. Design that slot before adopting the states below.

## Deferred types

```ts
export type CapabilityCallTerminalStateV1 =
  | "succeeded"
  | "failed"
  | "rejected"
  | "unknown_outcome";

export interface CapabilityArtifactRefV1 {
  digest: string;
  manifestDigest: string;
  toolManifestDigest: string;
  byteLength: number;
}

export interface CapabilityOfferV1 {
  protocolVersion: "spotlight.capabilities/1";
  offerId: string;
  projectId: string;
  sessionId: string;
  frontendBuildId: string;
  browserInstanceId: string;
  tabInstanceId: string;
  capabilityArtifact: CapabilityArtifactRefV1;
  liveTools: Array<{ name: string; version: string }>;
}

export type CapabilityHandshakeResultV1 =
  | {
      status: "upload_required";
      handshakeId: string;
      uploadToken: string;
      resumeToken: string;
      artifactDigest: string;
      uploadUrl: string;
      expiresAt: string;
    }
  | {
      status: "accepted";
      handshakeId: string;
      capabilitySnapshotId: string;
      sessionBindingVersion: number;
      leaseId: string;
      leaseVersion: number;
      connectionId: string;
      connectionEpoch: number;
      leaseExpiresAt: string;
      capabilityChannelUrl: string;
      capabilityChannelToken: string;
      acceptedTools: ResolvedToolRefV1[];
      rejectedTools: Array<{ tool: ResolvedToolRefV1; reason: string }>;
    };

export interface SessionCapabilityBindingV1 {
  tenantId: string;
  subjectId: string;
  projectId: string;
  sessionId: string;
  capabilitySnapshotId: string;
  bindingVersion: number;
  boundAt: string;
}

export interface RenewCapabilityLeaseRequestV1 {
  sessionId: string;
  capabilitySnapshotId: string;
  leaseId: string;
  expectedLeaseVersion: number;
  connectionId: string;
  connectionEpoch: number;
  browserInstanceId: string;
  tabInstanceId: string;
  liveTools: Array<{ name: string; version: string }>;
}

/** Every field here exists to make a duplicate dispatch detectable. */
export interface HostActionFenceV2 {
  callId: string;
  attempt: number;
  inputDigest: string;
  sessionId: string;
  capabilitySnapshotId: string;
  leaseId: string;
  connectionId: string;
  connectionEpoch: number;
  tool: ResolvedToolRefV1;
}

export interface HostActionRequestV2 extends HostActionFenceV2 {
  type: "host_action_request";
  input: Record<string, unknown>;
  deadlineAt: string;
  idempotencyKey?: string;
  confirmationGrantId?: string;
  maxAttempts: number;
}

export interface HostActionAckV2 extends HostActionFenceV2 {
  type: "host_action_ack";
  status: "ack";
}

export interface HostActionNackV2 extends HostActionFenceV2 {
  type: "host_action_nack";
  status: "nack";
  handlerStarted: false;
  error: { code: string; message: string };
}

/** Approval is bound to one call and one input digest, never to a tool. */
export interface ToolConfirmationGrantV1 {
  grantId: string;
  subjectId: string;
  sessionId: string;
  callId: string;
  tool: ResolvedToolRefV1;
  inputDigest: string;
  policyRevision: string;
  expiresAt: string;
}
```

## Deferred error codes

`HANDSHAKE_TOKEN_INVALID`, `HANDSHAKE_STATE_CONFLICT`, `OFFER_EXPIRED`,
`SESSION_BINDING_CONFLICT`, `SNAPSHOT_EXPIRED`, `CONFIRMATION_GRANT_INVALID`,
`CAPABILITY_CONNECTION_CONFLICT`, `CAPABILITY_LEASE_FENCED`,
`CAPABILITY_LEASE_REVOKED`, `UNKNOWN_OUTCOME`, plus the `ARTIFACT_*` family.
