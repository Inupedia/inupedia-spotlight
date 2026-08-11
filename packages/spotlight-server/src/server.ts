import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import type { HostToolResultRequest } from "@inupedia/spotlight-protocol";
import type { RunManager } from "./runManager.js";

export interface BuildServerOptions {
  runManager: RunManager;
  projectId: string;
  apiKeys?: string[];
  corsOrigin?: string | string[];
  uiPrompts?: Record<string, unknown>;
  videoChannels?: Array<{ id: string; name: string; aliases: string[] }>;
}

function writeSse(reply: FastifyReply, event: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function buildServer(options: BuildServerOptions) {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
  await app.register(cors, {
    origin: options.corsOrigin ?? "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Spotlight-Api-Key"],
  });
  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health" || !options.apiKeys?.length) return;
    const direct = request.headers["x-spotlight-api-key"];
    const authorization = request.headers.authorization;
    const supplied = typeof direct === "string"
      ? direct
      : authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : undefined;
    if (!supplied || !options.apiKeys.includes(supplied)) {
      await reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid API key" } });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "@inupedia/spotlight-server",
    version: "0.5.4",
    runtime: "langchain-langgraph",
    projectId: options.projectId,
  }));
  app.get("/v1/meta/host-tools", async () => ({ version: "0.5.4", tools: [] }));
  app.get("/v1/meta/ui-prompts", async () => ({
    projectId: options.projectId,
    prompts: options.uiPrompts ?? { capabilityHelpPatterns: [], suggestionChips: { default: ["你能做什么"] } },
  }));
  app.get("/v1/meta/video-channels", async () => ({
    projectId: options.projectId,
    channels: options.videoChannels ?? [],
  }));

  app.post<{ Body: Record<string, unknown> }>("/v1/runs", async (request, reply) => {
    const body = request.body;
    if (typeof body?.userQuestion !== "string" || !body.userQuestion.trim()) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "userQuestion is required" } });
    }
    if (body.projectId && body.projectId !== options.projectId) {
      return reply.status(403).send({ error: { code: "PROJECT_FORBIDDEN", message: "Project is not loaded" } });
    }
    const run = options.runManager.createRun(
      body as unknown as Parameters<RunManager["createRun"]>[0],
    );
    return { runId: run.id };
  });
  app.get<{ Params: { runId: string } }>("/v1/runs/:runId/events", async (request, reply) => {
    if (!options.runManager.getRun(request.params.runId)) {
      return reply.status(404).send({ error: { code: "RUN_NOT_FOUND", message: "Run not found" } });
    }
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.hijack();
    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;
    const onEvent = (event: Parameters<Parameters<RunManager["subscribe"]>[1]>[0]) => {
      writeSse(reply, event);
      if (event.type === "run_completed" || event.type === "run_error") {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        reply.raw.end();
      }
    };
    unsubscribe = options.runManager.subscribe(request.params.runId, onEvent);
    if (!reply.raw.writableEnded) {
      heartbeat = setInterval(() => writeSse(reply, { type: "ping", at: Date.now() }), 15_000);
    }
    heartbeat?.unref();
    request.raw.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    });
  });
  app.post<{ Params: { runId: string }; Body: HostToolResultRequest }>(
    "/v1/runs/:runId/host-results",
    async (request, reply) => {
      const ok = options.runManager.completeHostAction(request.params.runId, request.body);
      return ok ? { ok: true } : reply.status(404).send({ error: { code: "HOST_ACTION_NOT_FOUND" } });
    },
  );
  app.delete<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    return options.runManager.cancelRun(request.params.runId)
      ? { ok: true }
      : reply.status(404).send({ error: { code: "RUN_NOT_FOUND" } });
  });
  return app;
}
