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
  /** Observation payload injected into every model call; keep it cheap. */
  maxObservedStateBytes: 8 * 1024,
} as const;

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
