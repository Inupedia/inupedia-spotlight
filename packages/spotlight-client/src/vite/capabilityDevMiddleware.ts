import type { IncomingMessage, ServerResponse } from "node:http";

import type { CapabilityPluginBuildResultV1 } from "./capabilityBuildTypes.js";

const ROUTE_SUFFIX = "@spotlight/capability-artifacts/";
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export type CapabilityDevMiddlewareV1 = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

export function createCapabilityDevMiddlewareV1(
  currentResult: () => Readonly<CapabilityPluginBuildResultV1>,
  base = "/",
): CapabilityDevMiddlewareV1 {
  const normalizedBase = `/${base}`.replace(/\/+/g, "/").replace(/\/?$/, "/");
  const routePrefix = `${normalizedBase}${ROUTE_SUFFIX}`;
  return (request, response, next) => {
    const url = request.url ?? "";
    if (!url.startsWith(routePrefix)) {
      next();
      return;
    }

    const requestedDigest = url.slice(routePrefix.length);
    if (!DIGEST_PATTERN.test(requestedDigest)) {
      response.statusCode = 404;
      response.end();
      return;
    }

    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      response.end();
      return;
    }

    const result = currentResult();
    if (requestedDigest !== result.buildInfo.artifactDigest) {
      response.statusCode = 404;
      response.end();
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "application/gzip");
    response.setHeader("Content-Length", String(result.archive.byteLength));
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (method === "HEAD") {
      response.end();
      return;
    }

    response.end(
      Buffer.from(
        result.archive.buffer,
        result.archive.byteOffset,
        result.archive.byteLength,
      ),
    );
  };
}
