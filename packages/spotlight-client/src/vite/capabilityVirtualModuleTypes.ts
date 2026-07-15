declare module "virtual:spotlight/capabilities" {
  import type { CapabilityBuildInfoV1 } from "@inupedia/spotlight-client/vite";

  export interface ArtifactUploadStreamV1 {
    digest: string;
    byteLength: number;
    contentType: "application/gzip";
    stream: ReadableStream<Uint8Array>;
  }

  export const capabilityBuildInfo: Readonly<CapabilityBuildInfoV1>;

  export function openUploadStream(): Promise<ArtifactUploadStreamV1>;
}
