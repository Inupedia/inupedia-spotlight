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
  /^(?:打开|播放|进入|定位|显示|查看|open|play|enter|locate|show|view)$/iu;
const UNRESOLVED_REFERENTIAL_TARGET =
  /^(?:这个|那个|它|这个东西|那个东西|刚才那个|刚才的|上一个|前一个|this|this one|that|that one|it|the one)$/iu;

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
  return UNRESOLVED_REFERENTIAL_TARGET.test(target);
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
    if (candidates.length === 1 && required.length === 0) {
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
    if (route.requestedToolNames.length > 0) {
      return {
        requestedToolNames: route.requestedToolNames,
        requestedToolInput: route.toolInput,
      };
    }
    if (route.route !== "action") {
      return { requestedToolNames: [] };
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
        return applyIntentSafetyFence(question, decision);
      }
    }

    const explicitActionEvidence = extractActionEvidence(question);
    if (explicitActionEvidence) {
      if (
        hasUnresolvedExplicitActionTarget(
          question,
          explicitActionEvidence,
          context,
        )
      ) {
        return {
          route: "clarify",
          confidence: 1,
          reason:
            "The action verb requires a target, but the latest message contains only an unresolved or missing reference.",
          requestedToolNames: [],
          explicitActionEvidence,
          matchedSkillNames: [],
        };
      }
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
