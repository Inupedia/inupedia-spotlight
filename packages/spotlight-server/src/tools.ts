import { tool } from "langchain";
import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import { z } from "zod";
import type { BaseStore } from "@langchain/langgraph";
import type {
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
) {
  assertServerToolMetadata(definition);
  return tool(
    async (input: Record<string, unknown>) => stringify(await definition.invoke(input, context)),
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

export function memoryNamespace(projectId: string, subjectId: string): string[] {
  return [projectId, "subjects", subjectId];
}

export function createLongTermMemoryTools(
  store: BaseStore,
  namespace: string[],
  mode: "remember" | "forget" | "both",
) {
  const tools = [];
  if (mode === "remember" || mode === "both") {
    tools.push(tool(
      async ({ key, value }) => {
        await store.put(namespace, key, { value, updatedAt: new Date().toISOString() });
        return `Remembered ${key}.`;
      },
      {
        name: "remember_user_preference",
        description: "Persist a user preference or fact only when the user explicitly asks to remember it.",
        schema: rememberSchema,
      },
    ));
  }
  if (mode === "forget" || mode === "both") {
    tools.push(tool(
      async ({ key }) => {
        await store.delete(namespace, key);
        return `Forgot ${key}.`;
      },
      {
        name: "forget_user_preference",
        description: "Delete a persisted preference only when the user explicitly asks to forget it.",
        schema: forgetSchema,
      },
    ));
  }
  return tools;
}

export function createKnowledgeTool(provider: KnowledgeProvider, context: RunContext) {
  return tool(
    async ({ query, limit }) =>
      stringify(
        await provider.search({
          query,
          limit,
          projectId: context.project.projectId,
          sessionId: context.request.sessionId ?? context.runId,
          signal: context.signal,
        }),
      ),
    {
      name: "project_knowledge_search",
      description: "Search the configured project knowledge base and return source evidence.",
      schema: searchSchema,
    },
  );
}

export function createWebSearchTool(provider: WebSearchProvider, context: RunContext) {
  return tool(
    async ({ query, limit }) =>
      stringify(
        await provider.search({
          query,
          limit,
          projectId: context.project.projectId,
          sessionId: context.request.sessionId ?? context.runId,
          signal: context.signal,
        }),
      ),
    {
      name: "web_search",
      description: "Search the web for current evidence using the configured provider.",
      schema: searchSchema,
    },
  );
}
