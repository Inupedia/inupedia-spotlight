#!/usr/bin/env node
import { createAgentModel, createRouterModel } from "./model.js";
import { createMemoryRuntime } from "./memory.js";
import { loadProjectPack } from "./project.js";
import { LangChainIntentRouter } from "./router.js";
import { RunManager } from "./runManager.js";
import { buildServer } from "./server.js";

function required(name: string, fallbackName?: string): string {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : "");
  if (!value) throw new Error(`${name}${fallbackName ? ` or ${fallbackName}` : ""} is required`);
  return value;
}

export async function main(): Promise<void> {
  const project = await loadProjectPack(required("SPOTLIGHT_PROJECT_CONFIG"));
  const useQwen = process.env.SPOTLIGHT_LLM_PROVIDER?.trim().toLowerCase() === "qwen";
  const modelConfig = {
    apiKey: required(
      "SPOTLIGHT_LLM_API_KEY",
      useQwen ? "QWEN_API_KEY" : "SILICONFLOW_API_KEY",
    ),
    baseURL:
      process.env.SPOTLIGHT_LLM_BASE_URL ??
      (useQwen ? process.env.QWEN_API_BASE : process.env.SILICONFLOW_API_BASE),
    model:
      process.env.SPOTLIGHT_LLM_MODEL ??
      (useQwen ? process.env.QWEN_MODEL : process.env.SILICONFLOW_MODEL) ??
      "gpt-4.1-mini",
    routerModel: process.env.SPOTLIGHT_ROUTER_MODEL,
    timeoutMs: Number(process.env.SPOTLIGHT_LLM_TIMEOUT_MS ?? 45_000),
  };
  const routerConfig = {
    apiKey:
      process.env.SPOTLIGHT_ROUTER_API_KEY?.trim() ||
      process.env.QWEN_API_KEY?.trim() ||
      modelConfig.apiKey,
    baseURL:
      process.env.SPOTLIGHT_ROUTER_BASE_URL ??
      process.env.QWEN_API_BASE ??
      modelConfig.baseURL,
    model:
      process.env.SPOTLIGHT_ROUTER_MODEL ??
      process.env.QWEN_MODEL ??
      modelConfig.model,
    timeoutMs: Number(process.env.SPOTLIGHT_ROUTER_TIMEOUT_MS ?? 20_000),
  };
  const memory = createMemoryRuntime(process.env.SPOTLIGHT_DATABASE_URL);
  await memory.setup();
  const manager = new RunManager({
    project,
    model: createAgentModel(modelConfig),
    router: new LangChainIntentRouter(createRouterModel(routerConfig)),
    checkpointer: memory.checkpointer,
    store: memory.store,
    hostActionTimeoutMs: Number(process.env.SPOTLIGHT_HOST_ACTION_TIMEOUT_MS ?? 30_000),
  });
  const app = await buildServer({
    runManager: manager,
    projectId: project.projectId,
    apiKeys: (process.env.SPOTLIGHT_API_KEYS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    uiPrompts: project.uiPrompts,
    videoChannels: project.videoChannels,
  });
  await app.listen({
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 8787),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
