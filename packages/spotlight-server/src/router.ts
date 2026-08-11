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

const skillToolSelectionSchema = z.object({
  toolName: z.string().min(1),
  toolInput: z.record(z.string(), z.unknown()).default({}),
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
): { skill: SpotlightSkill; example: string; toolName?: string } | null {
  const normalizedQuestion = normalizeCapabilityExample(question);
  for (const skill of skills) {
    if (!skill.allowedTools?.length) continue;
    for (const item of skill.toolExamples ?? []) {
      if (normalizeCapabilityExample(item.example) === normalizedQuestion) {
        return { skill, example: item.example, toolName: item.toolName };
      }
    }
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
        matchedSkillNames: [],
      };
    }
    const matchedSkillExample = matchSkillCapabilityExample(question, skills);
    if (matchedSkillExample) {
      const skillTools = clientTools.filter((tool) =>
        matchedSkillExample.skill.allowedTools?.includes(tool.name),
      );
      const informationOnly =
        hasInformationEvidence(question) && !extractActionEvidence(question);
      const safeReadTools = skillTools.filter(
        (tool) => tool.sideEffect === "none",
      );
      if (informationOnly && safeReadTools.length === 0) {
        return {
          route: "knowledge",
          confidence: 1,
          reason:
            "Informational Skill example has no registered read-only client tool.",
          requestedToolNames: [],
          explicitActionEvidence: null,
          matchedSkillNames: [],
        };
      }
      const candidateTools = informationOnly ? safeReadTools : skillTools;
      const exactTool = matchedSkillExample.toolName
        ? candidateTools.find(
            (tool) => tool.name === matchedSkillExample.toolName,
          )
        : undefined;
      const selectedTool = exactTool
        ? {
            requestedToolNames: [exactTool.name],
            requestedToolInput: {},
          }
        : await this.selectSkillTool(
            question,
            matchedSkillExample.skill,
            candidateTools,
          );
      return {
        route: "action",
        confidence: 1,
        reason: `Deterministic consumer Skill capability example match: ${matchedSkillExample.skill.name}.`,
        requestedToolNames: selectedTool.requestedToolNames,
        requestedToolInput: selectedTool.requestedToolInput,
        explicitActionEvidence: matchedSkillExample.example,
        matchedSkillNames: [matchedSkillExample.skill.name],
      };
    }
    if (hasInformationEvidence(question) && !extractActionEvidence(question)) {
      return {
        route: "knowledge",
        confidence: 1,
        reason: "Deterministic information intent fence.",
        requestedToolNames: [],
        explicitActionEvidence: null,
        matchedSkillNames: [],
      };
    }
    const explicitActionEvidence = extractActionEvidence(question);
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
      matchedSkillNames: [],
    });
  }
}
