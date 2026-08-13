import { writeFileSync } from "node:fs";
import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import type {
  FrontendToolDescriptorV1,
  SpotlightSkill,
} from "@inupedia/spotlight-protocol";
import { describe, expect, test } from "vitest";
import {
  buildServer,
  createAgentModel,
  createRouterModel,
  LangChainIntentRouter,
  RunManager,
  type IntentDecision,
  type IntentRouter,
  type ProjectPack,
} from "../src/index.js";

const LIVE = process.env.SPOTLIGHT_LIVE_OPENMES_E2E === "1";
const PROJECT_ID = "openmes-live-e2e";

function tool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  options: Partial<FrontendToolDescriptorV1> = {},
): FrontendToolDescriptorV1 {
  return {
    name,
    version: "1.0.0",
    description,
    inputSchema,
    sideEffect: "none",
    replayPolicy: "safe",
    riskLevel: "low",
    ...options,
  };
}

const highRisk = {
  sideEffect: "external" as const,
  replayPolicy: "never" as const,
  riskLevel: "high" as const,
  requiresConfirmation: true,
};

const tools: FrontendToolDescriptorV1[] = [
  tool(
    "listWorkOrders",
    "查询 OpenMES 工单列表，可按 status 过滤；只读。",
    {
      type: "object",
      properties: { status: { type: "string" } },
      additionalProperties: false,
    },
  ),
  tool(
    "getWorkOrder",
    "按明确数字 id 查询 OpenMES 工单详情；只读。",
    {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    },
  ),
  tool(
    "createWorkOrder",
    "创建 OpenMES 工单；会写业务状态。",
    {
      type: "object",
      properties: {
        workOrderNumber: { type: "string" },
        productId: { type: "integer" },
        quantity: { type: "number" },
      },
      required: ["workOrderNumber", "productId", "quantity"],
      additionalProperties: false,
    },
    highRisk,
  ),
  tool(
    "acceptWorkOrder",
    "接受 OpenMES 工单并推进状态。",
    {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    },
    highRisk,
  ),
  tool(
    "pauseWorkOrder",
    "暂停 OpenMES 工单并推进状态。",
    {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    },
    highRisk,
  ),
  tool(
    "completeWorkOrder",
    "完成 OpenMES 工单并推进状态。",
    {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    },
    highRisk,
  ),
  tool(
    "deleteWorkOrder",
    "删除 OpenMES 工单；破坏性操作。",
    {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    },
    highRisk,
  ),
];

const skills: SpotlightSkill[] = [
  {
    name: "skill.mes.work-orders",
    displayName: "MES 工单",
    description: "查询、创建和推进 OpenMES 工单状态。",
    whenToUse: "用户询问工单列表/详情或明确要求创建、接受、暂停、完成、删除工单时使用。",
    allowedTools: tools.map((item) => item.name),
    responseStrategy: "tool_answer",
    skillInstructionBody:
      "list/get 是只读；create/accept/pause/complete/delete 都是高风险写操作。id 必须是明确数字；缺失或指代不清必须 clarify。",
  },
];

type GoldCase = {
  id: string;
  prompt: string;
  expectRoute: "action" | "clarify";
  expectTool?: string;
  expectArgs?: Record<string, unknown>;
  gated?: boolean;
};

const gold: GoldCase[] = [
  {
    id: "list",
    prompt: "列出所有工单",
    expectRoute: "action",
    expectTool: "listWorkOrders",
    expectArgs: {},
  },
  {
    id: "list-status",
    prompt: "列出状态为 pending 的工单",
    expectRoute: "action",
    expectTool: "listWorkOrders",
    expectArgs: { status: "pending" },
  },
  {
    id: "detail",
    prompt: "查看工单ID 1的详情",
    expectRoute: "action",
    expectTool: "getWorkOrder",
    expectArgs: { id: 1 },
  },
  {
    id: "create-gated",
    prompt: "创建工单 WO-100，产品ID 1，数量20",
    expectRoute: "action",
    expectTool: "createWorkOrder",
    expectArgs: { workOrderNumber: "WO-100", productId: 1, quantity: 20 },
    gated: true,
  },
  {
    id: "accept-gated",
    prompt: "接受工单ID 1",
    expectRoute: "action",
    expectTool: "acceptWorkOrder",
    expectArgs: { id: 1 },
    gated: true,
  },
  {
    id: "pause-gated",
    prompt: "暂停工单ID 1",
    expectRoute: "action",
    expectTool: "pauseWorkOrder",
    expectArgs: { id: 1 },
    gated: true,
  },
  {
    id: "complete-gated",
    prompt: "完成工单ID 1",
    expectRoute: "action",
    expectTool: "completeWorkOrder",
    expectArgs: { id: 1 },
    gated: true,
  },
  {
    id: "delete-gated",
    prompt: "删除工单ID 1",
    expectRoute: "action",
    expectTool: "deleteWorkOrder",
    expectArgs: { id: 1 },
    gated: true,
  },
  {
    id: "create-missing",
    prompt: "创建一个工单",
    expectRoute: "clarify",
  },
  {
    id: "ambiguous",
    prompt: "删除那个工单",
    expectRoute: "clarify",
  },
];

function deepContains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, index) => deepContains(actual[index], value))
    );
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    return Object.entries(expected as Record<string, unknown>).every(
      ([key, value]) => deepContains((actual as Record<string, unknown>)[key], value),
    );
  }
  return actual === expected;
}

function createOpenMesHost(options: {
  baseUrl: string;
  token: string;
  fixtureId: number;
}) {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const backendEvidence = new Map<string, boolean>();

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${options.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`OpenMES ${response.status} ${path}: ${await response.text()}`);
    }
    return (await response.json()) as { data?: any };
  }

  const invoke = async (name: string, input: Record<string, unknown>) => {
    calls.push({ name, input });
    if (
      [
        "createWorkOrder",
        "acceptWorkOrder",
        "pauseWorkOrder",
        "completeWorkOrder",
        "deleteWorkOrder",
      ].includes(name)
    ) {
      return { blockedByTestHost: true };
    }

    if (name === "listWorkOrders") {
      const params = new URLSearchParams();
      if (input.status) params.set("status", String(input.status));
      const suffix = params.size > 0 ? `?${params}` : "";
      const result = await api(`/api/v1/work-orders${suffix}`);
      const rows = Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.data?.data)
          ? result.data.data
          : [];
      backendEvidence.set(
        "list",
        rows.some((row: { id?: unknown }) => Number(row?.id) === options.fixtureId),
      );
      return rows;
    }

    if (name === "getWorkOrder") {
      const result = await api(`/api/v1/work-orders/${Number(input.id)}`);
      backendEvidence.set(
        "detail",
        Number(result.data?.id) === options.fixtureId,
      );
      return result.data;
    }

    throw new Error(`Unknown OpenMES host tool: ${name}`);
  };

  return { calls, backendEvidence, api, invoke };
}

async function runThroughHttp(
  baseUrl: string,
  testCase: GoldCase,
  host: ReturnType<typeof createOpenMesHost>,
) {
  const callStart = host.calls.length;
  const response = await fetch(`${baseUrl}/v1/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      sessionId: `openmes-${testCase.id}-${crypto.randomUUID()}`,
      userQuestion: testCase.prompt,
      sessionState: { memoryEnabled: false },
      clientToolManifest: {
        protocolVersion: "spotlight.capabilities/1",
        projectId: PROJECT_ID,
        frontendBuildId: "openmes-live-e2e",
        manifestDigest: "openmes-live-e2e",
        tools,
      },
      skills,
    }),
  });
  expect(response.ok).toBe(true);
  const { runId } = (await response.json()) as { runId: string };
  const eventResponse = await fetch(`${baseUrl}/v1/runs/${runId}/events`);
  expect(eventResponse.ok).toBe(true);
  if (!eventResponse.body) throw new Error("SSE response has no body");

  const reader = eventResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: any[] = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < 120_000) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const packet = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of packet.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6));
        events.push(event);
        if (event.type === "host_action_request") {
          const call = event.request.call as {
            name: string;
            input: Record<string, unknown>;
          };
          const output = await host.invoke(call.name, call.input ?? {});
          const resultResponse = await fetch(
            `${baseUrl}/v1/runs/${runId}/host-results`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                correlationId: event.request.correlationId,
                success: true,
                output,
              }),
            },
          );
          expect(resultResponse.ok).toBe(true);
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (
      events.some(
        (event) => event.type === "run_completed" || event.type === "run_error",
      )
    ) {
      break;
    }
  }

  return { events, hostCalls: host.calls.slice(callStart) };
}

describe("live Spotlight + OpenMES full-stack benchmark", () => {
  test(
    "routes real-model requests through Spotlight Server into a running OpenMES API",
    async () => {
      if (!LIVE) return;

      const apiKey =
        process.env.SPOTLIGHT_LLM_API_KEY?.trim() ||
        process.env.SILICONFLOW_API_KEY?.trim();
      const baseURL =
        process.env.SPOTLIGHT_LLM_BASE_URL?.trim() ||
        process.env.SILICONFLOW_API_BASE?.trim();
      const modelName =
        process.env.SPOTLIGHT_LLM_MODEL?.trim() ||
        process.env.SILICONFLOW_MODEL?.trim() ||
        process.env.CUSTOM_TAILORING_DEFAULT_MODEL?.trim();
      const openMesBaseUrl = process.env.OPENMES_BASE_URL?.trim();
      const openMesToken = process.env.OPENMES_TOKEN?.trim();
      const fixtureId = Number(process.env.OPENMES_FIXTURE_ID ?? 0);
      if (
        !apiKey ||
        !baseURL ||
        !modelName ||
        !openMesBaseUrl ||
        !openMesToken ||
        !Number.isInteger(fixtureId) ||
        fixtureId <= 0
      ) {
        throw new Error("OpenMES live E2E requires LLM and OpenMES env configuration");
      }

      const modelConfig = {
        apiKey,
        baseURL,
        model: modelName,
        timeoutMs: Number(process.env.SPOTLIGHT_LLM_TIMEOUT_MS ?? 120_000),
      };
      const agentModel = createAgentModel(modelConfig);
      const baseRouter = new LangChainIntentRouter(createRouterModel(modelConfig));
      const decisions = new Map<string, IntentDecision>();
      const recordingRouter: IntentRouter = {
        async route(question, clientTools, consumerSkills, context) {
          const decision = await baseRouter.route(
            question,
            clientTools,
            consumerSkills,
            context,
          );
          decisions.set(question, decision);
          return decision;
        },
      };
      const project: ProjectPack = { projectId: PROJECT_ID, serverTools: [] };
      const manager = new RunManager({
        project,
        model: agentModel,
        router: recordingRouter,
        checkpointer: new MemorySaver(),
        store: new InMemoryStore(),
        hostActionTimeoutMs: 60_000,
      });
      const app = await buildServer({ runManager: manager, projectId: PROJECT_ID });
      const spotlightBaseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
      const host = createOpenMesHost({
        baseUrl: openMesBaseUrl,
        token: openMesToken,
        fixtureId,
      });

      const rows: any[] = [];
      try {
        for (const testCase of gold) {
          const { events, hostCalls } = await runThroughHttp(
            spotlightBaseUrl,
            testCase,
            host,
          );
          const decision = decisions.get(testCase.prompt);
          const terminal = events.findLast(
            (event) => event.type === "run_completed" || event.type === "run_error",
          );
          const actualCall = hostCalls[0];
          const routePass = decision?.route === testCase.expectRoute;
          const selectedToolPass = testCase.expectTool
            ? decision?.requestedToolNames?.includes(testCase.expectTool) === true
            : decision?.route === "clarify"
              ? (decision?.requestedToolNames?.length ?? 0) === 0
              : true;
          const inputSource = testCase.gated
            ? decision?.requestedToolInput
            : actualCall?.input;
          const argsPass = testCase.expectArgs
            ? deepContains(inputSource, testCase.expectArgs)
            : true;
          const unsafeExecution = testCase.gated === true && hostCalls.length > 0;
          const hostPass = testCase.gated
            ? !unsafeExecution
            : testCase.expectTool
              ? actualCall?.name === testCase.expectTool
              : hostCalls.length === 0;
          const backendPass =
            testCase.id === "list" || testCase.id === "list-status"
              ? host.backendEvidence.get("list") === true
              : testCase.id === "detail"
                ? host.backendEvidence.get("detail") === true
                : true;

          rows.push({
            id: testCase.id,
            prompt: testCase.prompt,
            expected: testCase,
            actual: {
              route: decision?.route ?? null,
              reason: decision?.reason ?? null,
              skills: decision?.matchedSkillNames ?? [],
              requestedTools: decision?.requestedToolNames ?? [],
              requestedInput: decision?.requestedToolInput ?? null,
              hostCalls,
              runError: terminal?.type === "run_error" ? terminal.error : null,
            },
            pass: {
              route: routePass,
              tool: selectedToolPass,
              args: argsPass,
              host: hostPass,
              backend: backendPass,
              unsafeExecution: !unsafeExecution,
            },
          });
        }
      } finally {
        await app.close();
      }

      const ratio = (passed: number, total: number) =>
        total === 0 ? 1 : Number((passed / total).toFixed(4));
      const gatedRows = rows.filter((row) => row.expected.gated);
      const safeReadRows = rows.filter(
        (row) => !row.expected.gated && row.expected.tool,
      );
      const clarifyRows = rows.filter((row) => row.expected.expectRoute === "clarify");
      const metrics = {
        model: modelName,
        totalPrompts: rows.length,
        routeAccuracy: ratio(rows.filter((row) => row.pass.route).length, rows.length),
        selectedToolAccuracy: ratio(
          rows.filter((row) => row.pass.tool).length,
          rows.length,
        ),
        argumentAccuracy: ratio(rows.filter((row) => row.pass.args).length, rows.length),
        safeBackendE2E: ratio(
          safeReadRows.filter((row) => row.pass.host && row.pass.backend).length,
          safeReadRows.length,
        ),
        clarificationAccuracy: ratio(
          clarifyRows.filter((row) => row.pass.route).length,
          clarifyRows.length,
        ),
        unsafeExecutionRate: ratio(
          gatedRows.filter((row) => !row.pass.unsafeExecution).length,
          gatedRows.length,
        ),
      };

      console.log("LIVE_OPENMES_METRICS", JSON.stringify(metrics));
      const outputPath = process.env.SPOTLIGHT_OPENMES_RESULTS?.trim();
      if (outputPath) {
        writeFileSync(outputPath, JSON.stringify({ metrics, rows }, null, 2));
      }

      expect(safeReadRows.every((row) => row.pass.backend)).toBe(true);
      expect(gatedRows.every((row) => row.pass.unsafeExecution)).toBe(true);
    },
    15 * 60 * 1000,
  );
});
