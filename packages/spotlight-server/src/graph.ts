import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { Annotation, END, START, StateGraph, messagesStateReducer } from "@langchain/langgraph";
import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { createAgent, toolCallLimitMiddleware, toolRetryMiddleware } from "langchain";
import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import type {
  IntentDecision,
  RunContext,
  SpotlightRunResult,
} from "./contracts.js";
import type { IntentRouter } from "./router.js";
import { actionToolAllowlist, memoryControlMode } from "./safety.js";
import {
  createClientLangChainTool,
  createKnowledgeTool,
  createLongTermMemoryTools,
  createServerLangChainTool,
  createWebSearchTool,
  memoryNamespace,
} from "./tools.js";

const RuntimeState = Annotation.Root({
  question: Annotation<string>(),
  decision: Annotation<IntentDecision>(),
  assistantReply: Annotation<string>(),
  invokedClientTools: Annotation<string[]>(),
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

function messageText(message: BaseMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => (typeof part === "string" ? part : "text" in part ? String(part.text) : ""))
    .join("");
}

function finalAgentText(result: { messages?: BaseMessage[] }): string {
  return messageText(result.messages?.at(-1)).trim();
}

export interface SpotlightGraphOptions {
  model: BaseChatModel;
  router: IntentRouter;
  checkpointer: BaseCheckpointSaver;
  store: BaseStore;
  onPhase?: (phase: string, summary: string) => void;
}

export async function runSpotlightGraph(
  context: RunContext,
  options: SpotlightGraphOptions,
): Promise<SpotlightRunResult> {
  const clientTools = context.request.clientToolManifest?.tools ?? [];
  const memorySubjectId = context.request.memorySubjectId?.trim();
  const namespace = memorySubjectId
    ? memoryNamespace(context.project.projectId, memorySubjectId)
    : null;
  const graph = new StateGraph(RuntimeState)
    .addNode("route", async (state) => {
      const decision = await options.router.route(state.question, clientTools);
      const allowed = actionToolAllowlist(clientTools, decision);
      if (decision.route === "action" && allowed.length === 0) {
        options.onPhase?.("router_done", "路由要求澄清，未开放任何 Client Tool。");
        return {
          decision: {
            ...decision,
            route: "clarify" as const,
            reason: "No registered client tool safely matches the requested action.",
          },
        };
      }
      options.onPhase?.("router_done", `已路由到 ${decision.route} Agent。`);
      return { decision };
    })
    .addNode("knowledge", async (state) => {
      options.onPhase?.("knowledge_agent_start", "Knowledge Agent 已启动。");
      const tools: StructuredToolInterface[] = context.project.serverTools
        .filter((item) => item.metadata.effect === "read")
        .map((item) => createServerLangChainTool(item, context));
      if (context.project.knowledgeProvider) {
        tools.push(createKnowledgeTool(context.project.knowledgeProvider, context));
      }
      if (context.project.webSearchProvider) {
        tools.push(createWebSearchTool(context.project.webSearchProvider, context));
      }
      const controlMode = memoryControlMode(state.question);
      if (controlMode && !namespace) {
        const reply = "当前没有可识别的用户身份，不能安全地保存跨会话记忆。请先配置 memorySubjectId。";
        options.onPhase?.("knowledge_agent_done", "未写入记忆：缺少稳定用户身份。");
        return {
          assistantReply: reply,
          invokedClientTools: [],
          messages: [new AIMessage(reply)],
        };
      }
      if (controlMode && namespace) {
        tools.push(...createLongTermMemoryTools(options.store, namespace, controlMode));
      }
      const storedMemories = namespace
        ? await options.store.search(namespace, { limit: 20 })
        : [];
      const memoryContext = storedMemories.length
        ? `User-approved long-term memory:\n${storedMemories
            .map((item) => `- ${item.key}: ${JSON.stringify(item.value)}`)
            .join("\n")}`
        : "";
      const agent = createAgent({
        model: options.model,
        tools,
        systemPrompt: [
          "You are the Spotlight Knowledge Agent.",
          "Answer informational questions using evidence. Never perform or propose a client UI action.",
          "Cite source titles or URLs returned by tools when available. Say when evidence is insufficient.",
          "Long-term memory is user-scoped context, not evidence. Never write or delete it unless the latest message explicitly requests that operation.",
          controlMode ? `The user explicitly requested a ${controlMode} operation. You must call the provided memory tool before confirming success.` : "No memory mutation is allowed for this turn.",
          memoryContext,
          context.project.systemPrompt ?? "",
        ].join("\n"),
        middleware: [toolRetryMiddleware({ maxRetries: 2 }), toolCallLimitMiddleware({ runLimit: 6 })],
      });
      const result = await agent.invoke({ messages: state.messages });
      const reply = finalAgentText(result);
      options.onPhase?.("knowledge_agent_done", "Knowledge Agent 已完成回答。");
      return {
        assistantReply: reply,
        invokedClientTools: [],
        messages: [new AIMessage(reply)],
      };
    })
    .addNode("action", async (state) => {
      options.onPhase?.("action_agent_start", "Action Agent 已启动。");
      const invoked: string[] = [];
      const allowed = actionToolAllowlist(clientTools, state.decision);
      const tools = allowed.map((item) => createClientLangChainTool(item, context, invoked));
      const agent = createAgent({
        model: options.model,
        tools,
        systemPrompt: [
          "You are the Spotlight Action Agent.",
          "Execute exactly one explicit user-requested action with a provided client tool.",
          "Never substitute another tool or infer a missing target. If arguments are missing, ask one concise question.",
          context.project.systemPrompt ?? "",
        ].join("\n"),
        middleware: [toolCallLimitMiddleware({ runLimit: 1 })],
      });
      const result = await agent.invoke({ messages: state.messages });
      const reply = finalAgentText(result);
      options.onPhase?.("action_agent_done", "Action Agent 已完成操作。");
      return {
        assistantReply: reply,
        invokedClientTools: invoked,
        messages: [new AIMessage(reply)],
      };
    })
    .addNode("clarify", async () => {
      const reply =
        context.project.clarificationPrompt ??
        "我还不能安全地确定你要执行的操作或目标，请明确说要打开、关闭、播放或切换什么。";
      return { assistantReply: reply, invokedClientTools: [], messages: [new AIMessage(reply)] };
    })
    .addEdge(START, "route")
    .addConditionalEdges("route", (state) => state.decision.route, {
      knowledge: "knowledge",
      action: "action",
      clarify: "clarify",
    })
    .addEdge("knowledge", END)
    .addEdge("action", END)
    .addEdge("clarify", END)
    .compile({ checkpointer: options.checkpointer, store: options.store });

  const result = await graph.invoke(
    {
      question: context.request.userQuestion,
      messages: [new HumanMessage(context.request.userQuestion)],
      invokedClientTools: [],
      assistantReply: "",
    },
    {
      configurable: {
        thread_id: `${context.project.projectId}:${context.request.sessionId ?? context.runId}`,
      },
      signal: context.signal,
    },
  );
  return {
    route: result.decision.route,
    assistantReply: result.assistantReply,
    decision: result.decision,
    invokedClientTools: result.invokedClientTools,
  };
}
