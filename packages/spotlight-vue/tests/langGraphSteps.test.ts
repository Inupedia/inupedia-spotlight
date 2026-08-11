import { describe, expect, it } from "vitest";
import {
  applyLangGraphTransition,
  responseStepLabel,
} from "../src/remote/runPipeline.js";
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
});
