import { FakeToolCallingModel } from "langchain";
import { describe, expect, it } from "vitest";
import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import {
  applyToolInputCompletenessFence,
  hasUnresolvedExplicitActionTarget,
  invalidRequiredToolInputKeys,
  LangChainIntentRouter,
  missingRequiredToolInputKeys,
} from "../src/router.js";
import type { IntentDecision } from "../src/contracts.js";

const listDoctorsTool: FrontendToolDescriptorV1 = {
  name: "listDoctors",
  version: "1.0.0",
  description: "列出医生",
  inputSchema: { type: "object", properties: {} },
  sideEffect: "none",
  replayPolicy: "safe",
  riskLevel: "low",
};

const bookAppointmentTool: FrontendToolDescriptorV1 = {
  name: "bookAppointment",
  version: "1.0.0",
  description: "创建预约",
  inputSchema: {
    type: "object",
    properties: {
      patientName: { type: "string" },
      appointmentTime: { type: "string" },
    },
    required: ["patientName", "appointmentTime"],
  },
  sideEffect: "external",
  replayPolicy: "never",
  riskLevel: "high",
  requiresConfirmation: true,
};

const convertLeadTool: FrontendToolDescriptorV1 = {
  name: "convertLead",
  version: "1.0.0",
  description: "将线索转换为客户",
  inputSchema: {
    type: "object",
    properties: { id: { type: "integer" } },
    required: ["id"],
  },
  sideEffect: "external",
  replayPolicy: "never",
  riskLevel: "high",
  requiresConfirmation: true,
};

const returnWorkflowTaskTool: FrontendToolDescriptorV1 = {
  name: "returnWorkflowTask",
  version: "1.0.0",
  description: "将流程任务退回指定节点",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string" },
      targetActivityId: { type: "string" },
    },
    required: ["taskId", "targetActivityId"],
  },
  sideEffect: "external",
  replayPolicy: "never",
  riskLevel: "high",
  requiresConfirmation: true,
};

const flexibleIdTool: FrontendToolDescriptorV1 = {
  name: "confirmPurchaseOrder",
  version: "1.0.0",
  description: "确认采购单",
  inputSchema: {
    type: "object",
    properties: { id: { type: ["integer", "string"] } },
    required: ["id"],
  },
  sideEffect: "external",
  replayPolicy: "never",
  riskLevel: "high",
  requiresConfirmation: true,
};

const doctorSkill = {
  name: "skill.doctors",
  description: "医生目录",
  allowedTools: ["listDoctors"],
  responseStrategy: "tool_answer" as const,
};

describe("referential action routing", () => {
  it("clarifies a target-required action when the target is only an unresolved pronoun", async () => {
    expect(hasUnresolvedExplicitActionTarget("打开那个", "打开")).toBe(true);
    expect(hasUnresolvedExplicitActionTarget("打开", "打开")).toBe(true);
    expect(hasUnresolvedExplicitActionTarget("查看那个医生", "查看")).toBe(true);
    expect(hasUnresolvedExplicitActionTarget("删除那个医生", "删除")).toBe(true);
    expect(hasUnresolvedExplicitActionTarget("退回上一节点", "退回")).toBe(true);
    expect(hasUnresolvedExplicitActionTarget("转派给前一个处理人", "转派")).toBe(true);

    const router = new LangChainIntentRouter(new FakeToolCallingModel());
    const decision = await router.route("打开那个", [], []);

    expect(decision.route).toBe("clarify");
    expect(decision.requestedToolNames).toEqual([]);
  });

  it("clarifies an unresolved workflow target before any model routing", async () => {
    const router = new LangChainIntentRouter(new FakeToolCallingModel());
    const decision = await router.route("把任务 T-91 退回上一节点", [], []);

    expect(decision.route).toBe("clarify");
    expect(decision.requestedToolNames).toEqual([]);
    expect(decision.explicitActionEvidence).toBe("退回");
  });

  it("clarifies an unresolved view before a domain Skill can downgrade it to a list action", async () => {
    const router = new LangChainIntentRouter(new FakeToolCallingModel());
    const decision = await router.route(
      "查看那个医生",
      [listDoctorsTool],
      [doctorSkill],
    );

    expect(decision.route).toBe("clarify");
    expect(decision.matchedSkillNames).toEqual([]);
    expect(decision.requestedToolNames).toEqual([]);
  });

  it("does not classify a concrete named target as unresolved", () => {
    expect(hasUnresolvedExplicitActionTarget("查看医生 张三", "查看")).toBe(false);
    expect(hasUnresolvedExplicitActionTarget("删除医生ID 42", "删除")).toBe(false);
    expect(
      hasUnresolvedExplicitActionTarget(
        "把任务 T-91 退回到 activity-review",
        "退回",
      ),
    ).toBe(false);
  });

  it("does not force clarification when conversational context can resolve the reference", () => {
    expect(
      hasUnresolvedExplicitActionTarget("打开那个", "打开", {
        isReferential: true,
        lastAssistantReply: "刚才展示的是图书《活着》。",
      }),
    ).toBe(false);
  });
});

describe("required client-tool input routing", () => {
  it("converts an action to clarify when a selected tool is missing required schema input", () => {
    const decision: IntentDecision = {
      route: "action",
      confidence: 0.98,
      reason: "appointment skill matched",
      requestedToolNames: ["bookAppointment"],
      requestedToolInput: { patientName: "Robin" },
      explicitActionEvidence: "skill:skill.appointments",
      matchedSkillNames: ["skill.appointments"],
    };

    expect(missingRequiredToolInputKeys(decision, [bookAppointmentTool])).toEqual([
      "appointmentTime",
    ]);

    const fenced = applyToolInputCompletenessFence(decision, [
      bookAppointmentTool,
    ]);
    expect(fenced.route).toBe("clarify");
    expect(fenced.requestedToolNames).toEqual([]);
    expect(fenced.requestedToolInput).toBeUndefined();
    expect(fenced.matchedSkillNames).toEqual(["skill.appointments"]);
  });

  it("rejects a fabricated string when the required schema field is an integer", () => {
    const decision: IntentDecision = {
      route: "action",
      confidence: 0.95,
      reason: "lead skill matched",
      requestedToolNames: ["convertLead"],
      requestedToolInput: { id: "请提供线索ID" },
      explicitActionEvidence: "skill:skill.crm.leads",
      matchedSkillNames: ["skill.crm.leads"],
    };

    expect(invalidRequiredToolInputKeys(decision, [convertLeadTool])).toEqual([
      "id",
    ]);
    const fenced = applyToolInputCompletenessFence(decision, [convertLeadTool]);
    expect(fenced.route).toBe("clarify");
    expect(fenced.requestedToolNames).toEqual([]);
  });

  it("rejects a generated placeholder even when the required field type is string", () => {
    const decision: IntentDecision = {
      route: "action",
      confidence: 0.95,
      reason: "workflow skill matched",
      requestedToolNames: ["returnWorkflowTask"],
      requestedToolInput: {
        taskId: "T-91",
        targetActivityId: "需要用户指定退回的目标节点ID",
      },
      explicitActionEvidence: "skill:skill.oa.workflow-tasks",
      matchedSkillNames: ["skill.oa.workflow-tasks"],
    };

    expect(
      invalidRequiredToolInputKeys(decision, [returnWorkflowTaskTool]),
    ).toEqual(["targetActivityId"]);
    const fenced = applyToolInputCompletenessFence(decision, [
      returnWorkflowTaskTool,
    ]);
    expect(fenced.route).toBe("clarify");
    expect(fenced.requestedToolNames).toEqual([]);
  });

  it("preserves a real host union schema instead of coercing a valid string id", () => {
    const decision: IntentDecision = {
      route: "action",
      confidence: 0.95,
      reason: "purchase skill matched",
      requestedToolNames: ["confirmPurchaseOrder"],
      requestedToolInput: { id: "100" },
      explicitActionEvidence: "skill:skill.erp.purchase",
      matchedSkillNames: ["skill.erp.purchase"],
    };

    expect(invalidRequiredToolInputKeys(decision, [flexibleIdTool])).toEqual([]);
    const fenced = applyToolInputCompletenessFence(decision, [flexibleIdTool]);
    expect(fenced.route).toBe("action");
    expect(fenced.requestedToolInput).toEqual({ id: "100" });
  });

  it("keeps a complete schema-shaped action executable", () => {
    const decision: IntentDecision = {
      route: "action",
      confidence: 0.98,
      reason: "appointment skill matched",
      requestedToolNames: ["bookAppointment"],
      requestedToolInput: {
        patientName: "Robin",
        appointmentTime: "10:00",
      },
      explicitActionEvidence: "skill:skill.appointments",
      matchedSkillNames: ["skill.appointments"],
    };

    const fenced = applyToolInputCompletenessFence(decision, [
      bookAppointmentTool,
    ]);
    expect(fenced.route).toBe("action");
    expect(fenced.requestedToolNames).toEqual(["bookAppointment"]);
  });

  it("never retains a requested tool on an explicit clarify decision", () => {
    const decision: IntentDecision = {
      route: "clarify",
      confidence: 0.9,
      reason: "target missing",
      requestedToolNames: ["bookAppointment"],
      requestedToolInput: {},
      explicitActionEvidence: null,
      matchedSkillNames: ["skill.appointments"],
    };

    const fenced = applyToolInputCompletenessFence(decision, [
      bookAppointmentTool,
    ]);
    expect(fenced.route).toBe("clarify");
    expect(fenced.requestedToolNames).toEqual([]);
    expect(fenced.requestedToolInput).toBeUndefined();
  });
});
