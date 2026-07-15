export const CAPABILITY_ARTIFACT_ERROR_CODES = [
  "ARTIFACT_JSON_NOT_IJSON",
  "ARTIFACT_JSON_UNSUPPORTED_VALUE",
  "ARTIFACT_TOOL_DUPLICATE",
  "ARTIFACT_TOOL_INVALID",
] as const;

export type CapabilityArtifactErrorCode =
  (typeof CAPABILITY_ARTIFACT_ERROR_CODES)[number];

export class CapabilityArtifactError extends Error {
  readonly code: CapabilityArtifactErrorCode;

  constructor(code: CapabilityArtifactErrorCode, message: string) {
    super(message);
    this.name = "CapabilityArtifactError";
    this.code = code;
  }
}
