import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import type { SpotlightSkill } from "@inupedia/spotlight-protocol";
import { z } from "zod";
import type { IntentDecision } from "./contracts.js";
import {
  applyIntentSafetyFence,
  extractActionEvidence,
  hasMemoryControlEvidence,
} from "./safety.js";
import {
  candidateToolsForSkillRoute,
  routeViaSkillCatalog,
  type SkillRouteResult,
} from "./skillIntentRouter.js";

const intentSchema = z.object({
  route: z.enum(["knowledge", "action", "clarify"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  requestedToolNames: z.array(z.string()).default([]),
});

const skillToolSelectionSchema = z.object({
  toolName: z.string().min(1),
  toolInput: z.record(z.string(), z.unknown()).default({}),
});

const TARGET_REQUIRED_ACTION_EVIDENCE =
  /^(?:打开|播放|进入|定位|显示|查看|删除|移除|修改|编辑|取消|open|play|enter|locate|show|view|delete|remove|update|edit|cancel)$/iu;
const TARGET_REQUIRED_ACTION_SCAN =
  /(?:打开|播放|进入|定位|显示|查看|删除|移除|修改|编辑|取消|open|play|enter|locate|show|view|delete|remove|update|edit|cancel)/iu;
const UNRESOLVED_REFERENTIAL_TARGET =
  /^(?:这个|那个|它|这个东西|那个东西|刚才那个|刚才的|上一个|前一个|这位|那位|this|this one|that|that one|it|the one)$/iu;
const UNRESOLVED_CHINESE_DEICTIC_TARGET =
  /^(?:这个|那个|刚才那个|刚才的|上一个|前一个|这位|那位)[\p{Script=Han}]{1,8}$/u;
const UNRESOLVED_ENGLISH_DEICTIC_TARGET =
  /^(?:this|that|the previous|the last)\s+[a-z][a-z -]{0,32}$/iu;

export interface RouteContext {
  isReferential?: boolean;
  lastAssistantReply?: string | null;
  conversationContext?: string;
}

function hasUsableReferentialContext(context?: RouteContext): boolean {
  return Boolean(
    context?.lastAssistantReply?.trim() || context?.conversationContext?.trim(),
  );
}

function extractTargetRequiredActionEvidence(question: string): string | null {
  const match = question.match(TARGET_REQUIRED_ACTION_SCAN);
  return match?.[0] ?? null;
}

function isUnresolvedReferentialTarget(target: string): boolean {
  return (
    UNRESOLVED_REFERENTIAL_TARGET.test(target) ||
    UNRESOLVED_CHINESE_DEICTIC_TARGET.test(target) ||
    UNRESOLVED_ENGLISH_DEICTIC_TARGET.test(target)
  );
}

export function hasUnresolvedExplicitActionTarget(
  question: string,
  actionEvidence: string,
  context?: RouteContext,
): boolean {
  if (!TARGET_REQUIRED_ACTION_EVIDENCE.test(actionEvidence)) return false;
  if (hasUsableReferentialContext(context)) return false;
  const lowerQuestion = question.toLocaleLowerCase();
  const lowerEvidence = actionEvidence.toLocaleLowerCase();
  const evidenceIndex = lowerQuestion.indexOf(lowerEvidence);
  if (evidenceIndex < 0) return false;
  const target = question
    .slice(evidenceIndex + actionEvidence.length)
    .trim()
    .replace(/^[，,：:\s]+|[。.!！?？]+$/gu, "")
    .trim();
  if (!target) return true;
  if (context?.isReferential === true) return true;
  return isUnresolvedReferentialTarget(target);
}

function hasUsableRequiredValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function toolSchemaHasInputProperties(tool?: FrontendToolDescriptorV1): boolean {
  if (!tool?.inputSchema || typeof tool.inputSchema !== "object") return false;
  const properties = (tool.inputSchema as { properties?: unknown }).properties;
  return Boolean(
    properties &&
      typeof properties === "object" &&
      Object.keys(properties as Record<string, unknown>).length > 0,
  );
}

export function missingRequiredToolInputKeys(
  decision: IntentDecision,
  clientTools: FrontendToolDescriptorV1[],
): string[] {
  if (decision.route !== "action" || decision.requestedToolNames.length !== 1) {
    return [];
  }
  const selectedTool = clientTools.find(
    (tool) => tool.name === decision.requestedToolNames[0],
  );
  if (!selectedTool) return [];
  const required = Array.isArray(selectedTool.inputSchema?.required)
    ? selectedTool.inputSchema.required.filter(
        (field): field is string => typeof field === "string",
      )
    : [];
  const input = decision.requestedToolInput ?? {};
  return required.filter((field) => !hasUsableRequiredValue(input[field]));
}

export function applyToolInputCompletenessFence(
  decision: IntentDecision,
  clientTools: FrontendToolDescriptorV1[],
): IntentDecision {
  if (decision.route === "clarify") {
    return {
      ...decision,
      requestedToolNames: [],
      requestedToolInput: undefined,
    };
  }
  const missing = missingRequiredToolInputKeys(decision, clientTools);
  if (missing.length === 0) return decision;
  return {
    ...decision,
    route: "clarify",
    reason: `The selected client tool is missing required input: ${missing.join(", ")}.`,
    requestedToolNames: [],
    requestedToolInput: undefined,
  };
}

export interface IntentRouter {
  route(
    question: string,
    clientTools: FrontendToolDescriptorV1[],
    skills?: SpotlightSkill[],
    context?: RouteContext,
  ): Promise<IntentDecision>;
}

export class LangChainIntentRouter implements IntentRouter {
  constructor(private readonly model: BaseChatModel) {}

  private async selectSkillTool(
    question: string,
    skill: SpotlightSkill,
    candidates: FrontendToolDescriptorV1[],
  ): Promise<{
    requestedToolNames: string[];
    requestedToolInput?: Record<string, unknown>;
  }> {
    const onlyCandidate = candidates[0];
    const required = Array.isArray(onlyCandidate?.inputSchema.required)
      ? onlyCandidate.inputSchema.required
      : [];
    if (
      candidates.length === 1 &&
      required.length === 0 &&
      !toolSchemaHasInputProperties(onlyCandidate)
    ) {
      return { requestedToolNames: [onlyCandidate.name] };
    }
    if (candidates.length === 0) return { requestedToolNames: [] };
    const structured = this.model.withStructuredOutput(
      skillToolSelectionSchema,
      { name: "spotlight_skill_tool_selection" },
    );
    const selected = await structured.invoke([
      new SystemMessage(
        [
          "Select exactly one registered client tool for the latest user request.",
          "Use the matched Skill instructions, tool descriptions, and input schemas.",
          "Return only a toolName from the provided candidates. Never invent a name.",
          "Extract only arguments explicitly present or unambiguously resolved from context; never fabricate required values.",
        ].join("\n"),
      ),
      new HumanMessage(
        JSON.stringify({
          latestUserMessage: question,
          matchedSkill: {
            name: skill.name,
            description: skill.description,
            whenToUse: skill.whenToUse,
            instructions: skill.skillInstructionBody,
          },
          candidates: candidates.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        }),
      ),
    ]);
    return candidates.some((tool) => tool.name === selected.toolName)
      ? {
          requestedToolNames: [selected.toolName],
          requestedToolInput: selected.toolInput,
        }
      : { requestedToolNames: [] };
  }

  private async resolveSkillToolSelection(
    question: string,
    skills: SpotlightSkill[],
    clientTools: FrontendToolDescriptorV1[],
    route: SkillRouteResult,
  ): Promise<Pick<
    IntentDecision,
    "requestedToolNames" | "requestedToolInput"
  >> {
    if (route.route !== "action") {
      return { requestedToolNames: [] };
    }
    if (route.requestedToolNames.length > 0) {
      return {
        requestedToolNames: route.requestedToolNames,
        requestedToolInput: route.toolInput,
      };
    }
    const matchedSkills = skills.filter((skill) =>
      route.matchedSkillNames.includes(skill.name),
    );
    if (matchedSkills.length !== 1) {
      return { requestedToolNames: [] };
    }
    const candidates = candidateToolsForSkillRoute(
      skills,
      clientTools,
      route,
    );
    return this.selectSkillTool(question, matchedSkills[0], candidates);
  }

  private async decisionFromSkillRoute(
    question: string,
    skills: SpotlightSkill[],
    clientTools: FrontendToolDescriptorV1[],
    route: SkillRouteResult,
  ): Promise<IntentDecision> {
    const selected = await this.resolveSkillToolSelection(
      question,
      skills,
      clientTools,
      route,
    );
    return {
      route: route.route,
      confidence: route.confidence,
      reason: route.reason,
      requestedToolNames: selected.requestedToolNames,
      requestedToolInput: selected.requestedToolInput,
      explicitActionEvidence:
        route.route === "action"
          ? `skill:${route.matchedSkillNames.join(",")}`
          : null,
      matchedSkillNames: route.matchedSkillNames,
    };
  }

  async route(
    question: string,
    clientTools: FrontendToolDescriptorV1[],
    skills: SpotlightSkill[] = [],
    context?: RouteContext,
  ): Promise<IntentDecision> {
    if (hasMemoryControlEvidence(question)) {
      return {
        route: "knowledge",
        confidence: 1,
        reason: "Deterministic memory-control intent fence.",
        requestedToolNames: [],
        explicitActionEvidence: null,
        matchedSkillNames: [],
      };
    }

    const explicitActionEvidence = extractActionEvidence(question);
    const targetRequiredEvidence =
      explicitActionEvidence ?? extractTargetRequiredActionEvidence(question);
    if (
      targetRequiredEvidence &&
      hasUnresolvedExplicitActionTarget(
        question,
        targetRequiredEvidence,
        context,
      )
    ) {
      return {
        route: "clarify",
        confidence: 1,
        reason:
          "The action verb requires a target, but the latest message contains only an unresolved or missing reference.",
        requestedToolNames: [],
        explicitActionEvidence: targetRequiredEvidence,
        matchedSkillNames: [],
      };
    }

    if (skills.length > 0) {
      const skillRoute = await routeViaSkillCatalog(
        this.model,
        question,
        clientTools,
        skills,
        context,
      );
      if (skillRoute && skillRoute.matchedSkillNames.length > 0) {
        const decision = await this.decisionFromSkillRoute(
          question,
          skills,
          clientTools,
          skillRoute,
        );
        return applyIntentSafetyFence(
          question,
          applyToolInputCompletenessFence(decision, clientTools),
        );
      }
    }

    if (explicitActionEvidence) {
      return {
        route: "action",
        confidence: 1,
        reason:
          "Deterministic explicit-action intent fence; the Action Agent selects the registered tool.",
        requestedToolNames: [],
        explicitActionEvidence,
        matchedSkillNames: [],
      };
    }

    const toolCatalog = clientTools.map((item) => ({
      name: item.name,
      description: item.description,
      sideEffect: item.sideEffect,
    }));
    const skillCatalog = skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      responseStrategy: skill.responseStrategy,
      capabilityExamples: skill.capabilityExamples,
      allowedTools: skill.allowedTools,
    }));
    const structured = this.model.withStructuredOutput(intentSchema, {
      name: "spotlight_intent_route",
    });
    const raw = await structured.invoke([
      new SystemMessage(
        [
          "Route only the latest user message.",
          "knowledge: asks for facts, explanations, summaries, comparisons or searches.",
          "action: explicitly asks to change the UI or external state using a listed client tool.",
          "clarify: an action target or operation is missing or ambiguous.",
          "Never infer an action from project vocabulary, previous turns or memory.",
          "Never invent a cross-lane knowledge-then-action route. Only knowledge, action, or clarify.",
          "For action, requestedToolNames must contain only exact listed names.",
        ].join("\n"),
      ),
      new HumanMessage(
        JSON.stringify({
          latestUserMessage: question,
          clientTools: toolCatalog,
          consumerSkills: skillCatalog,
          conversationContext: context?.conversationContext,
          isReferential: context?.isReferential ?? false,
          lastAssistantReply: context?.lastAssistantReply ?? null,
        }),
      ),
    ]);
    return applyIntentSafetyFence(question, {
      ...raw,
      requestedToolNames: raw.requestedToolNames ?? [],
      explicitActionEvidence: null,
      matchedSkillNames: [],
    });
  }
}
