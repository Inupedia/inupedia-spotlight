import type {
  ConversationTurn,
  PendingTask,
} from "../types/session.js";
import type { SpotlightSessionInvokedSkill } from "@inupedia/spotlight-protocol";

export const AGENT_SESSION_STORAGE_KEY = "spotlight-agent-session";

export type PersistedAgentSession = {
  sessionId: string;
  activeTaskId: string | null;
  activeTopic: string | null;
  pendingTask: PendingTask | null;
  conversationSummary: string;
  summarizedTurnCount: number;
  conversationHistory: ConversationTurn[];
  invokedSkills: SpotlightSessionInvokedSkill[];
  skillPermissionGrants: string[];
};

export function readPersistedAgentSession(): Partial<PersistedAgentSession> | null {
  try {
    const raw = localStorage.getItem(AGENT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedAgentSession>;
  } catch {
    return null;
  }
}

export function writePersistedAgentSession(state: PersistedAgentSession): void {
  try {
    localStorage.setItem(AGENT_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function snapshotAgentSession(state: PersistedAgentSession): PersistedAgentSession {
  return {
    sessionId: state.sessionId,
    activeTaskId: state.activeTaskId,
    activeTopic: state.activeTopic,
    pendingTask: state.pendingTask,
    conversationSummary: state.conversationSummary,
    summarizedTurnCount: state.summarizedTurnCount,
    conversationHistory: state.conversationHistory,
    invokedSkills: state.invokedSkills,
    skillPermissionGrants: state.skillPermissionGrants,
  };
}
