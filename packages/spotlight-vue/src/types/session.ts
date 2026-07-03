import type { ConversationTurn, PendingTask } from "@inupedia/spotlight-protocol";

export type { ConversationTurn, PendingTask };

export type AgentTaskType = "qa" | "navigate" | "operate";

export type SessionControlIntent = "interrupt_question" | "repeat_last_answer";
