import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import type { SpotlightSkill } from "@inupedia/spotlight-protocol";
import { z } from "zod";
import type { IntentDecision } from "./contracts.js";
import {
  applyIntentSafetyFence,
  extractActionEvidence,
  hasInformationEvidence,
  hasMemoryControlEvidence,
} from "./safety.js";

const intentSchema = z.object({
  route: z.enum(["knowledge", "action", "clarify"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  requestedToolNames: z.array(z.string()).default([]),
});

export interface IntentRouter {
  route(
    question: string,
    clientTools: FrontendToolDescriptorV1[],
    skills?: SpotlightSkill[],
  ): Promise<IntentDecision>;
}

function normalizeCapabilityExample(value: string): string {
  return value.replace(/[\s，。！？、,.!?]/gu, "").toLowerCase();
}

function matchSkillCapabilityExample(
  question: string,
  skills: SpotlightSkill[],
): { skill: SpotlightSkill; example: string } | null {
  const normalizedQuestion = normalizeCapabilityExample(question);
  for (const skill of skills) {
    if (!skill.allowedTools?.length) continue;
    for (const example of skill.capabilityExamples ?? []) {
      if (normalizeCapabilityExample(example) === normalizedQuestion) {
        return { skill, example };
      }
    }
  }
  return null;
}

export class LangChainIntentRouter implements IntentRouter {
  constructor(private readonly model: BaseChatModel) {}

  async route(
    question: string,
    clientTools: FrontendToolDescriptorV1[],
    skills: SpotlightSkill[] = [],
  ): Promise<IntentDecision> {
    if (hasMemoryControlEvidence(question)) {
      return {
        route: "knowledge",
        confidence: 1,
        reason: "Deterministic memory-control intent fence.",
        requestedToolNames: [],
        explicitActionEvidence: null,
      };
    }
    if (hasInformationEvidence(question) && !extractActionEvidence(question)) {
      return {
        route: "knowledge",
        confidence: 1,
        reason: "Deterministic information intent fence.",
        requestedToolNames: [],
        explicitActionEvidence: null,
      };
    }
    const matchedSkillExample = matchSkillCapabilityExample(question, skills);
    if (matchedSkillExample) {
      return {
        route: "action",
        confidence: 1,
        reason: `Deterministic consumer Skill capability example match: ${matchedSkillExample.skill.name}.`,
        requestedToolNames: [],
        explicitActionEvidence: matchedSkillExample.example,
      };
    }
    const explicitActionEvidence = extractActionEvidence(question);
    if (explicitActionEvidence) {
      return {
        route: "action",
        confidence: 1,
        reason: "Deterministic explicit-action intent fence; the Action Agent selects the registered tool.",
        requestedToolNames: [],
        explicitActionEvidence,
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
          "For action, requestedToolNames must contain only exact listed names.",
        ].join("\n"),
      ),
      new HumanMessage(
        JSON.stringify({
          latestUserMessage: question,
          clientTools: toolCatalog,
          consumerSkills: skillCatalog,
        }),
      ),
    ]);
    return applyIntentSafetyFence(question, {
      ...raw,
      requestedToolNames: raw.requestedToolNames ?? [],
      explicitActionEvidence: null,
    });
  }
}
