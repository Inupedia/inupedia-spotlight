/**
 * 会话状态 Store（Sprint 4）
 * 多轮对话、挂起任务与恢复
 */
import { defineStore } from "pinia";
import type {
  AgentTaskType,
  ConversationTurn,
  PendingTask,
} from "../types/session.js";
import type { SpotlightSessionInvokedSkill } from "@inupedia/spotlight-protocol";
import {
  readPersistedAgentSession,
  snapshotAgentSession,
  writePersistedAgentSession,
} from "./agentSessionPersistence.js";

const MAX_RECENT_TURNS = 8;
const SUMMARY_WINDOW_SIZE = 4;
const MAX_SUMMARY_LINES = 12;
const DEFAULT_CONTEXT_SUMMARY_CHAR_BUDGET = 700;
const DEFAULT_CONTEXT_RECENT_TURN_CHAR_BUDGET = 700;

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeTurnContent(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function truncateText(content: string, maxChars: number): string {
  const normalized = normalizeTurnContent(content);
  if (maxChars <= 0 || !normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  if (maxChars <= 3) return normalized.slice(0, maxChars);
  return `${normalized.slice(0, maxChars - 3)}...`;
}

function summarizeTurn(turn: ConversationTurn): string {
  const roleLabel =
    turn.role === "user" ? "用户" : turn.role === "assistant" ? "助手" : "工具";
  const purposeLabel = turn.purpose ? `/${turn.purpose}` : "";
  const content = normalizeTurnContent(turn.content);
  const shortContent =
    content.length > 48 ? `${content.slice(0, 48).trim()}...` : content;
  return `${roleLabel}${purposeLabel}：${shortContent || "（空）"}`;
}

function mergeSummary(
  previousSummary: string,
  turns: ConversationTurn[],
): string {
  const previousLines = previousSummary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const nextLines = turns.map(summarizeTurn);
  return [...previousLines, ...nextLines].slice(-MAX_SUMMARY_LINES).join("\n");
}

function selectRecentTurnsWithinChars(
  turns: ConversationTurn[],
  maxChars: number,
): ConversationTurn[] {
  if (maxChars <= 0 || !turns.length) return [];
  const collected: ConversationTurn[] = [];
  let usedChars = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index];
    const turnChars = normalizeTurnContent(turn.content).length;
    if (collected.length > 0 && usedChars + turnChars > maxChars) {
      break;
    }
    if (collected.length === 0 && turnChars > maxChars) {
      collected.unshift({
        ...turn,
        content: truncateText(turn.content, maxChars),
      });
      break;
    }
    collected.unshift(turn);
    usedChars += turnChars;
  }
  return collected;
}

function renderConversationContext(params: {
  conversationSummary: string;
  recentTurns: ConversationTurn[];
  summarizedTurnCount: number;
}): string {
  const parts: string[] = [];
  if (params.conversationSummary) {
    parts.push(
      `历史摘要（已压缩 ${params.summarizedTurnCount} 条）：\n${params.conversationSummary}`,
    );
  }
  if (params.recentTurns.length) {
    parts.push(
      `最近对话：\n${params.recentTurns.map(summarizeTurn).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

function persistAgentSession(state: {
  sessionId: string;
  activeTaskId: string | null;
  activeTopic: string | null;
  pendingTask: PendingTask | null;
  conversationSummary: string;
  summarizedTurnCount: number;
  conversationHistory: ConversationTurn[];
  invokedSkills: SpotlightSessionInvokedSkill[];
  skillPermissionGrants: string[];
}) {
  writePersistedAgentSession(snapshotAgentSession(state));
}

export const useAgentSessionStore = defineStore("agentSession", {
  state: () => {
    const persisted = readPersistedAgentSession();
    return {
      sessionId: persisted?.sessionId ?? generateSessionId(),
      activeTaskId: persisted?.activeTaskId ?? null,
      activeTopic: persisted?.activeTopic ?? null,
      pendingTask: persisted?.pendingTask ?? null,
      conversationSummary: persisted?.conversationSummary ?? "",
      summarizedTurnCount: persisted?.summarizedTurnCount ?? 0,
      conversationHistory: persisted?.conversationHistory ?? [],
      invokedSkills: persisted?.invokedSkills ?? [],
      skillPermissionGrants: persisted?.skillPermissionGrants ?? [],
    };
  },
  actions: {
    compactTurnsIntoSummary(turnCount: number) {
      if (turnCount <= 0) return;
      const compactedTurns = this.conversationHistory.slice(0, turnCount);
      if (!compactedTurns.length) return;
      this.conversationSummary = mergeSummary(
        this.conversationSummary,
        compactedTurns,
      );
      this.summarizedTurnCount += compactedTurns.length;
      this.conversationHistory = this.conversationHistory.slice(turnCount);
      persistAgentSession(this.$state);
    },
    resetSession() {
      this.sessionId = generateSessionId();
      this.activeTaskId = null;
      this.activeTopic = null;
      this.pendingTask = null;
      this.conversationSummary = "";
      this.summarizedTurnCount = 0;
      this.conversationHistory = [];
      this.invokedSkills = [];
      this.skillPermissionGrants = [];
      persistAgentSession(this.$state);
    },
    setActiveTask(id: string | null) {
      this.activeTaskId = id;
      persistAgentSession(this.$state);
    },
    setInvokedSkills(skills: SpotlightSessionInvokedSkill[]) {
      this.invokedSkills = skills;
      persistAgentSession(this.$state);
    },
    grantSkillPermission(skillName: string) {
      if (this.skillPermissionGrants.includes(skillName)) return;
      this.skillPermissionGrants.push(skillName);
      persistAgentSession(this.$state);
    },
    setActiveTopic(topic: string | null) {
      this.activeTopic = topic;
      persistAgentSession(this.$state);
    },
    /** 挂起当前任务，用于用户插问时 */
    setPendingTask(task: PendingTask | null) {
      this.pendingTask = task;
      persistAgentSession(this.$state);
    },
    /** 清除挂起任务（用户选择不继续或导览结束） */
    clearPendingTask() {
      this.pendingTask = null;
      persistAgentSession(this.$state);
    },
    pushTurn(
      role: ConversationTurn["role"],
      content: string,
      purpose?: ConversationTurn["purpose"],
    ) {
      this.conversationHistory.push({
        role,
        content,
        timestamp: Date.now(),
        purpose,
      });
      this.compactConversationHistory();
      persistAgentSession(this.$state);
    },
    /** 最近 N 轮对话（用于上下文压缩） */
    getRecentTurns(n: number): ConversationTurn[] {
      return this.conversationHistory.slice(-n);
    },
    getRecentTurnsWithinChars(maxChars: number): ConversationTurn[] {
      return selectRecentTurnsWithinChars(this.conversationHistory, maxChars);
    },
    compactConversationHistory() {
      if (
        this.conversationHistory.length <=
        MAX_RECENT_TURNS + SUMMARY_WINDOW_SIZE
      ) {
        return;
      }
      const compactUntil = this.conversationHistory.length - MAX_RECENT_TURNS;
      this.compactTurnsIntoSummary(compactUntil);
    },
    getConversationSnapshot(options?: {
      summaryChars?: number;
      recentTurnChars?: number;
      enforceSummaryBoundary?: boolean;
    }) {
      const summaryChars =
        options?.summaryChars ?? DEFAULT_CONTEXT_SUMMARY_CHAR_BUDGET;
      const recentTurnChars =
        options?.recentTurnChars ?? DEFAULT_CONTEXT_RECENT_TURN_CHAR_BUDGET;
      const recentTurns = this.getRecentTurnsWithinChars(recentTurnChars);
      const conversationSummary = truncateText(
        this.conversationSummary,
        summaryChars,
      );
      return {
        conversationSummary,
        recentTurns,
        contextText: renderConversationContext({
          conversationSummary,
          recentTurns,
          summarizedTurnCount: this.summarizedTurnCount,
        }),
      };
    },
    getConversationContext(options?: {
      summaryChars?: number;
      recentTurnChars?: number;
      enforceSummaryBoundary?: boolean;
    }) {
      return this.getConversationSnapshot(options).contextText;
    },
    /** 最后一条助手回复（用于 repeat_last_answer） */
    getLastAssistantContent(): string | null {
      for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
        if (this.conversationHistory[i].role === "assistant") {
          return this.conversationHistory[i].content;
        }
      }
      return null;
    },
    applySessionPatch(patch: {
      sessionId?: string;
      activeTaskId?: string | null;
      activeTopic?: string | null;
      pendingTask?: PendingTask | null;
      conversationSummary?: string;
      summarizedTurnCount?: number;
      conversationHistory?: ConversationTurn[];
      lastAssistantReply?: string | null;
      invokedSkills?: SpotlightSessionInvokedSkill[];
      skillPermissionGrants?: string[];
      memoryEnabled?: boolean;
      tenantId?: string;
    }) {
      if (patch.sessionId) this.sessionId = patch.sessionId;
      if (patch.activeTaskId !== undefined) this.activeTaskId = patch.activeTaskId;
      if (patch.activeTopic !== undefined) this.activeTopic = patch.activeTopic;
      if (patch.pendingTask !== undefined) this.pendingTask = patch.pendingTask;
      if (patch.conversationSummary !== undefined) {
        this.conversationSummary = patch.conversationSummary;
      }
      if (patch.summarizedTurnCount !== undefined) {
        this.summarizedTurnCount = patch.summarizedTurnCount;
      }
      if (patch.conversationHistory?.length) {
        this.conversationHistory = patch.conversationHistory;
      }
      if (patch.invokedSkills?.length) {
        this.invokedSkills = patch.invokedSkills;
      }
      if (patch.skillPermissionGrants?.length) {
        this.skillPermissionGrants = patch.skillPermissionGrants;
      }
      persistAgentSession(this.$state);
    },
  },
});
