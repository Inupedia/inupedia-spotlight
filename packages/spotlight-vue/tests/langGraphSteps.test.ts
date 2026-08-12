import { describe, expect, it } from "vitest";
import {
  applyLangGraphTransition,
  applyRemoteEvent,
  beginHostToolCall,
  responseStepLabel,
  settleHostToolCall,
} from "../src/remote/runPipeline.js";
import { appendStepToolCalls } from "../src/store/pipeline/steps.js";
import type { HandlerApi } from "../src/store/pipeline/types.js";
import type { AgentStep } from "../src/store/types.js";
import type { SpotlightExecutionEvent } from "../src/store/runtime/types.js";

function createApi() {
  let steps: AgentStep[] = [];
  const api = {
    getSteps: () => steps,
    setSteps: (next: AgentStep[]) => {
      steps = next;
    },
    setStep: (
      id: string,
      status: AgentStep["status"],
      content?: string,
    ) => {
      steps = steps.map((step) =>
        step.id === id
          ? { ...step, status, ...(content === undefined ? {} : { content }) }
          : step,
      );
    },
    appendToolCallsToStep: (
      stepId: string,
      toolCalls: NonNullable<AgentStep["toolCalls"]>,
    ) => {
      appendStepToolCalls(steps, stepId, toolCalls);
    },
  } as unknown as HandlerApi;
  return { api, getSteps: () => steps };
}

function transition(
  phase: Extract<
    SpotlightExecutionEvent,
    { type: "turn_transition" }
  >["phase"],
  summary: string,
): Extract<SpotlightExecutionEvent, { type: "turn_transition" }> {
  return {
    type: "turn_transition",
    at: Date.now(),
    turnId: "turn-1",
    phase,
    summary,
  };
}

describe("LangGraph progress steps", () => {
  it("shows real action-agent phases in order", () => {
    const { api, getSteps } = createApi();
    applyLangGraphTransition(api, transition("routing", "正在路由"));
    applyLangGraphTransition(api, transition("router_done", "已路由到 action Agent"));
    applyLangGraphTransition(api, transition("action_agent_start", "Action Agent 已启动"));

    expect(getSteps()).toEqual([
      expect.objectContaining({ label: "分析意图", status: "done" }),
      expect.objectContaining({ label: "选择工具", status: "active" }),
    ]);

    applyLangGraphTransition(api, transition("action_agent_done", "Action Agent 已完成操作"));
    expect(getSteps()[1]).toEqual(
      expect.objectContaining({ label: "选择工具", status: "done" }),
    );
    expect(responseStepLabel(api)).toBe("执行工具与回答");
  });

  it("shows real knowledge-agent phases in order", () => {
    const { api, getSteps } = createApi();
    applyLangGraphTransition(api, transition("routing", "正在路由"));
    applyLangGraphTransition(api, transition("router_done", "已路由到 knowledge Agent"));
    applyLangGraphTransition(api, transition("knowledge_agent_start", "Knowledge Agent 已启动"));
    applyLangGraphTransition(api, transition("knowledge_agent_done", "Knowledge Agent 已完成回答"));

    expect(getSteps()).toEqual([
      expect.objectContaining({ label: "分析意图", status: "done" }),
      expect.objectContaining({ label: "检索知识", status: "done" }),
    ]);
    expect(responseStepLabel(api)).toBe("知识问答");
  });

  it("labels a clarification response without pretending a tool ran", () => {
    const { api } = createApi();
    applyLangGraphTransition(api, transition("routing", "正在路由"));
    applyLangGraphTransition(api, transition("router_done", "已路由到 clarify Agent"));
    expect(responseStepLabel(api)).toBe("生成回答");
  });

  it("keeps memory replay visible as a completed step", () => {
    const { api, getSteps } = createApi();
    applyLangGraphTransition(api, transition("memory_replay", "已复用记忆"));
    expect(getSteps()).toEqual([
      expect.objectContaining({
        label: "问题拆解",
        status: "done",
        content: "已复用记忆",
      }),
    ]);
  });

  it("closes the action selection step when tool execution starts", async () => {
    const { api, getSteps } = createApi();
    applyLangGraphTransition(
      api,
      transition("action_agent_start", "已选定工具：openBimBuilding。"),
    );
    await applyRemoteEvent(api, {
      type: "tool_start",
      at: Date.now(),
      iteration: 1,
      call: {
        id: "bim-1",
        name: "openBimBuilding",
        input: { target: "泸定取水口" },
        displayName: "打开 BIM 建筑",
      },
    });

    const steps = getSteps();
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "选择工具", status: "done" }),
        expect.objectContaining({
          label: "执行工具与回答",
          status: "active",
        }),
      ]),
    );
    expect(
      steps.filter((step) => step.status === "active").map((step) => step.label),
    ).toEqual(["执行工具与回答"]);
  });

  it("renders expandable tool calls from tool_start and tool_result events", async () => {
    const { api, getSteps } = createApi();
    await applyRemoteEvent(api, {
      type: "tool_start",
      at: Date.now(),
      iteration: 1,
      call: {
        id: "kb-1",
        name: "project_knowledge_search",
        input: { query: "引大济岷" },
        displayName: "检索项目知识库",
      },
    });
    await applyRemoteEvent(api, {
      type: "tool_start",
      at: Date.now(),
      iteration: 1,
      call: {
        id: "query-1",
        name: "query_kb",
        input: { query: "引大济岷" },
        displayName: "query_kb",
      },
    });
    await applyRemoteEvent(api, {
      type: "tool_result",
      at: Date.now(),
      iteration: 1,
      result: {
        call: {
          id: "query-1",
          name: "query_kb",
          input: { query: "引大济岷" },
          displayName: "query_kb",
        },
        success: true,
        summary: "query_kb 已返回结果",
        output: [{ title: "工程概况" }],
        trace: [],
      },
    });

    const toolStep = getSteps().find((step) => step.id === "3");
    expect(toolStep?.status).toBe("active");
    expect(toolStep?.toolCalls).toEqual([
      expect.objectContaining({
        id: "kb-1",
        name: "project_knowledge_search",
        status: "running",
      }),
      expect.objectContaining({
        id: "query-1",
        name: "query_kb",
        status: "done",
      }),
    ]);
  });

  it("shows host tool execution while the frontend action is running", () => {
    const { api, getSteps } = createApi();
    const call = {
      id: "host-1",
      name: "mode.openPeopleFocus",
      input: {},
      displayName: "开启人员定位",
    };
    beginHostToolCall(api, call);
    expect(getSteps()[0]?.toolCalls).toEqual([
      expect.objectContaining({
        id: "host-1",
        name: "mode.openPeopleFocus",
        status: "running",
      }),
    ]);
    settleHostToolCall(api, call, {
      success: true,
      data: { opened: true },
      trace: [],
      executionTarget: "host",
    });
    expect(getSteps()[0]?.toolCalls).toEqual([
      expect.objectContaining({
        id: "host-1",
        status: "done",
      }),
    ]);
  });
});
