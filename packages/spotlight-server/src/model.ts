import { ChatOpenAI } from "@langchain/openai";

export interface SpotlightModelConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  routerModel?: string;
  timeoutMs?: number;
}

export function createAgentModel(config: SpotlightModelConfig) {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    temperature: 0.1,
    timeout: config.timeoutMs ?? 45_000,
    maxRetries: 1,
    configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
  });
}

export function createRouterModel(config: SpotlightModelConfig) {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.routerModel ?? config.model,
    temperature: 0,
    timeout: config.timeoutMs ?? 20_000,
    maxRetries: 1,
    configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
  });
}
