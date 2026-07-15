import type { CapabilityErrorCodeV1, CapabilityProtocolErrorV1 } from "@inupedia/spotlight-protocol";

export class SpotlightCapabilityError extends Error {
  constructor(
    readonly code: CapabilityErrorCodeV1,
    message: string,
    readonly retryable = false,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SpotlightCapabilityError";
  }
}

export async function capabilityResponseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => undefined) as T | CapabilityProtocolErrorV1 | undefined;
  if (response.ok) return body as T;
  const error = body && typeof body === "object" && "error" in body ? body.error : undefined;
  throw new SpotlightCapabilityError(
    error?.code ?? "HANDSHAKE_STATE_CONFLICT",
    error?.message ?? `Capability request failed with HTTP ${response.status}.`,
    error?.retryable ?? false,
    error?.details,
  );
}
