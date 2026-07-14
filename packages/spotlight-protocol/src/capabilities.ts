export const SPOTLIGHT_CAPABILITY_PROTOCOL_V1 =
  "spotlight.capabilities/1" as const;

export const CAPABILITY_ERROR_CODES_V1 = [
  "PROTOCOL_VERSION_UNSUPPORTED",
  "ARTIFACT_UPLOAD_REQUIRED",
  "ARTIFACT_NOT_PUBLISHED",
  "ARTIFACT_RUNTIME_UPLOAD_DISABLED",
  "ARTIFACT_INVALID",
  "ARTIFACT_DIGEST_MISMATCH",
  "HANDSHAKE_TOKEN_INVALID",
  "HANDSHAKE_STATE_CONFLICT",
  "OFFER_EXPIRED",
  "PROJECT_FORBIDDEN",
  "SESSION_BINDING_CONFLICT",
  "SNAPSHOT_EXPIRED",
  "TOOL_NOT_REGISTERED",
  "TOOL_INPUT_INVALID",
  "TOOL_OUTPUT_INVALID",
  "CONFIRMATION_GRANT_INVALID",
  "CAPABILITY_CONNECTION_CONFLICT",
  "CAPABILITY_LEASE_FENCED",
  "CAPABILITY_LEASE_REVOKED",
  "RESOURCE_MIME_UNSUPPORTED",
  "HOST_OFFLINE",
  "HOST_ACTION_TIMEOUT",
  "UNKNOWN_OUTCOME",
] as const;

export type CapabilityErrorCodeV1 = (typeof CAPABILITY_ERROR_CODES_V1)[number];
export type JsonSchemaV1 = Record<string, unknown>;
export type ToolExecutionTargetV1 = "browser" | "server" | "mcp";
export type ToolSideEffectV1 = "none" | "ui" | "external";
export type ToolReplayPolicyV1 = "safe" | "idempotency-key" | "never";
export type ToolRiskLevelV1 = "low" | "medium" | "high";

export interface CapabilityProtocolErrorV1 {
  error: {
    code: CapabilityErrorCodeV1;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export interface FrontendToolDescriptorV1 {
  name: string;
  version: string;
  description: string;
  inputSchema: JsonSchemaV1;
  outputSchema?: JsonSchemaV1;
  maxOutputBytes?: number;
  sideEffect: ToolSideEffectV1;
  replayPolicy: ToolReplayPolicyV1;
  riskLevel?: ToolRiskLevelV1;
  requiresConfirmation?: boolean;
}

export interface ResolvedToolRefV1 {
  target: ToolExecutionTargetV1;
  registryId: string;
  name: string;
  version: string;
}

export interface CapabilityArtifactRefV1 {
  digest: string;
  manifestDigest: string;
  toolManifestDigest: string;
  byteLength: number;
}

export interface CapabilityOfferV1 {
  protocolVersion: typeof SPOTLIGHT_CAPABILITY_PROTOCOL_V1;
  offerId: string;
  projectId: string;
  sessionId: string;
  frontendBuildId: string;
  browserInstanceId: string;
  tabInstanceId: string;
  capabilityArtifact: CapabilityArtifactRefV1;
  liveTools: Array<{ name: string; version: string }>;
}

export interface CapabilityArtifactUploadResultV1 {
  status: "artifact_stored";
  handshakeId: string;
  artifactDigest: string;
}

export interface CapabilityHandshakeResumeRequestV1 {
  resumeToken: string;
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
      rejectedTools: Array<{
        tool: ResolvedToolRefV1;
        reason: string;
      }>;
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

export interface CreateRunRequestV2 {
  projectId: string;
  sessionId: string;
  capabilitySnapshotId: string;
  sessionBindingVersion: number;
  userQuestion: string;
  uiContext?: Record<string, unknown>;
}

export interface ReserveCapabilityConnectionRequestV1 {
  expectedConnectionId: string;
  expectedConnectionEpoch: number;
  expectedLeaseVersion: number;
  browserInstanceId: string;
  tabInstanceId: string;
}

export interface ReservedCapabilityConnectionV1 {
  leaseId: string;
  leaseVersion: number;
  connectionId: string;
  connectionEpoch: number;
  capabilityChannelToken: string;
  tokenExpiresAt: string;
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

export type RenewCapabilityLeaseResultV1 =
  | {
      status: "renewed";
      leaseVersion: number;
      leaseExpiresAt: string;
      revocationEpoch: number;
      acceptedLiveTools: Array<{ name: string; version: string }>;
      rejectedLiveTools: Array<{
        name: string;
        version: string;
        reason: string;
      }>;
    }
  | { status: "revoked"; reason: string };

export interface CapabilityClientHelloV1 {
  type: "client_hello";
  capabilityChannelToken: string;
}

export interface CapabilityHeartbeatV1 {
  type: "heartbeat";
  leaseId: string;
  leaseVersion: number;
  connectionId: string;
  connectionEpoch: number;
  sentAt: string;
}

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

export type HostActionResultV2 = HostActionFenceV2 &
  (
    | {
        type: "host_action_result";
        outcome: "returned";
        output?: unknown;
      }
    | {
        type: "host_action_result";
        outcome: "threw";
        error: { code: string; message: string };
      }
  );

export interface ToolConfirmationDecisionV1 {
  decision: "approve" | "deny";
  inputDigest: string;
  expectedPolicyRevision: string;
}

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

export type CapabilityCallTerminalStateV1 =
  "succeeded" | "failed" | "rejected" | "unknown_outcome";

export type CapabilityChannelClientMessageV1 =
  | CapabilityClientHelloV1
  | CapabilityHeartbeatV1
  | HostActionAckV2
  | HostActionNackV2
  | HostActionResultV2;

export type CapabilityChannelServerMessageV1 =
  CapabilityHeartbeatV1 | HostActionRequestV2;
