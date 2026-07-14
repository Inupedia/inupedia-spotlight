import type {
  ResolvedToolRefV1,
  ToolReplayPolicyV1,
  ToolRiskLevelV1,
  ToolSideEffectV1,
} from "./capabilities.js";

export const CAPABILITY_SECURITY_LIMITS_V1 = {
  maxSkills: 200,
  maxFiles: 2_000,
  maxExpandedArtifactBytes: 20 * 1024 * 1024,
  maxSingleFileBytes: 1024 * 1024,
  maxSkillMarkdownBytes: 512 * 1024,
  maxCompressionRatio: 100,
  maxToolOutputBytes: 1024 * 1024,
  maxJsonDepth: 32,
  maxJsonStringBytes: 256 * 1024,
} as const;

export type CapabilityRuntimeUploadPolicyV1 =
  "disabled" | "prepublished-only" | "authenticated-build";

interface CapabilityPrincipalScopeV1 {
  tenantId: string;
  subjectId: string;
  projectId: string;
  sessionId: string;
}

export interface CapabilityObjectAuthorizationContextV1 extends CapabilityPrincipalScopeV1 {
  objectType:
    | "artifact"
    | "snapshot"
    | "session-binding"
    | "lease"
    | "connection"
    | "tool-call";
  objectId: string;
}

interface CapabilityTokenBindingBaseV1 extends CapabilityPrincipalScopeV1 {
  frontendBuildId: string;
  expiresAt: string;
}

export interface ApprovedToolPolicyV1 {
  tenantId: string;
  projectId: string;
  frontendBuildId: string;
  target: ResolvedToolRefV1["target"];
  name: string;
  version: string;
  descriptorDigest: string;
  classifiedSideEffect: ToolSideEffectV1;
  approvedReplayPolicy: ToolReplayPolicyV1;
  minimumRiskLevel: ToolRiskLevelV1;
  requiresConfirmation: boolean;
  revocationEpoch: number;
}

export interface CapabilityArtifactUploadTokenBindingV1 extends CapabilityTokenBindingBaseV1 {
  purpose: "artifact-upload";
  handshakeId: string;
  artifactDigest: string;
  byteLength: number;
}

export interface CapabilityHandshakeResumeTokenBindingV1 extends CapabilityTokenBindingBaseV1 {
  purpose: "handshake-resume";
  handshakeId: string;
  artifactDigest: string;
}

export interface CapabilityChannelTokenBindingV1 extends CapabilityTokenBindingBaseV1 {
  purpose: "capability-channel";
  capabilitySnapshotId: string;
  leaseId: string;
  connectionId: string;
  connectionEpoch: number;
  browserInstanceId: string;
  tabInstanceId: string;
}

export interface CapabilityConfirmationTokenBindingV1 extends CapabilityTokenBindingBaseV1 {
  purpose: "tool-confirmation";
  callId: string;
  inputDigest: string;
  policyRevision: string;
  tool: ResolvedToolRefV1;
}

export type CapabilityTokenBindingV1 =
  | CapabilityArtifactUploadTokenBindingV1
  | CapabilityHandshakeResumeTokenBindingV1
  | CapabilityChannelTokenBindingV1
  | CapabilityConfirmationTokenBindingV1;

export const CAPABILITY_REDACTED_LOG_KEYS_V1 = [
  "authorization",
  "cookie",
  "uploadToken",
  "resumeToken",
  "capabilityChannelToken",
  "confirmationGrantId",
  "cameraAuthUrl",
  "toolOutput",
] as const;
