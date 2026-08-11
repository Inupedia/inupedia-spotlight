import { tool } from "langchain";
import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import { z } from "zod";
import type { BaseStore } from "@langchain/langgraph";
import type {
  KnowledgeEvidence,
  KnowledgeProvider,
  RunContext,
  SpotlightServerTool,
  WebSearchProvider,
} from "./contracts.js";
import { assertServerToolMetadata } from "./safety.js";

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function langChainClientToolName(name: string): string {
  return `client_${name.replace(/[^a-zA-Z0-9_-]/gu, "_")}`;
}

export function createClientLangChainTool(
  descriptor: FrontendToolDescriptorV1,
  context: RunContext,
  invoked: string[],
) {
  return tool(
    async (input: Record<string, unknown>) => {
      const call = {
        id: crypto.randomUUID(),
        name: descriptor.name,
        input,
        displayName: descriptor.description || descriptor.name,
      };
      const result = await context.host.request(call);
      if (!result.success) {
        throw new Error(result.error || `Client tool failed: ${descriptor.name}`);
      }
      invoked.push(descriptor.name);
      return stringify(result.output ?? { success: true });
    },
    {
      name: langChainClientToolName(descriptor.name),
      description: `${descriptor.description} (client capability: ${descriptor.name})`,
      schema: descriptor.inputSchema,
    },
  );
}

export function createServerLangChainTool(
  definition: SpotlightServerTool,
  context: RunContext,
  progress?: ServerToolProgress,
) {
  assertServerToolMetadata(definition);
  return tool(
    async (input: Record<string, unknown>) => {
      progress?.onStart?.(input);
      const output = await definition.invoke(input, context);
      progress?.onComplete?.(input, output);
      return stringify(output);
    },
    {
      name: definition.name,
      description: definition.description,
      schema: definition.schema,
    },
  );
}

const searchSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  limit: z.number().int().min(1).max(20).optional(),
});

const rememberSchema = z.object({
  key: z.string().min(1).max(120).describe("Short stable key for the preference or fact"),
  value: z.string().min(1).max(2000).describe("The exact user-provided preference or fact to remember"),
});

const forgetSchema = z.object({
  key: z.string().min(1).max(120).describe("Key of the memory to delete"),
});

export interface SearchToolProgress {
  onStart?: (input: { query: string; limit?: number }) => void;
  onComplete?: (input: { query: string; limit?: number }, evidence: KnowledgeEvidence[]) => void;
}

export interface ServerToolProgress {
  onStart?: (input: Record<string, unknown>) => void;
  onComplete?: (input: Record<string, unknown>, output: unknown) => void;
}

export function memoryNamespace(projectId: string, subjectId: string): string[] {
  return [projectId, "subjects", subjectId];
}

export function createLongTermMemoryTools(store: BaseStore, namespace: string[], mode: "remember" | "forget" | "both") {
  const tools = [];
  if (mode === "remember" || mode === "both") {
    tools.push(
      tool(
        async ({ key, value }) => {
          await store.put(namespace, key, {
            value,
            updatedAt: new Date().toISOString(),
          });
          return `Remembered ${key}.`;
        },
        {
          name: "remember_user_preference",
          description: "Persist a user preference or fact only when the user explicitly asks to remember it.",
          schema: rememberSchema,
        },
      ),
    );
  }
  if (mode === "forget" || mode === "both") {
    tools.push(
      tool(
        async ({ key }) => {
          await store.delete(namespace, key);
          return `Forgot ${key}.`;
        },
        {
          name: "forget_user_preference",
          description: "Delete a persisted preference only when the user explicitly asks to forget it.",
          schema: forgetSchema,
        },
      ),
    );
  }
  return tools;
}

export function createKnowledgeTool(provider: KnowledgeProvider, context: RunContext, progress?: SearchToolProgress) {
  return tool(
    async ({ query, limit }) => {
      const input = { query, ...(limit === undefined ? {} : { limit }) };
      progress?.onStart?.(input);
      const evidence = await provider.search({
        ...input,
        projectId: context.project.projectId,
        sessionId: context.request.sessionId ?? context.runId,
        signal: context.signal,
      });
      progress?.onComplete?.(input, evidence);
      return stringify(evidence);
    },
    {
      name: "project_knowledge_search",
      description: "Search the configured project knowledge base and return source evidence.",
      schema: searchSchema,
    },
  );
}

export function createWebSearchTool(provider: WebSearchProvider, context: RunContext, progress?: SearchToolProgress) {
  return tool(
    async ({ query, limit }) => {
      const input = { query, ...(limit === undefined ? {} : { limit }) };
      progress?.onStart?.(input);
      const evidence = await provider.search({
        ...input,
        projectId: context.project.projectId,
        sessionId: context.request.sessionId ?? context.runId,
        signal: context.signal,
      });
      progress?.onComplete?.(input, evidence);
      return stringify(evidence);
    },
    {
      name: "web_search",
      description: "Search the web for current evidence using the configured provider.",
      schema: searchSchema,
    },
  );
}
