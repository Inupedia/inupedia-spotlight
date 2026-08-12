import type {
  CreateRunRequest,
  FrontendToolDescriptorV1,
  HostToolResultRequest,
} from "@inupedia/spotlight-protocol";

export type AgentRoute = "knowledge" | "action" | "clarify";

export type WorkflowLane =
  | "knowledge"
  | "action"
  | "clarify"
  | "memory_mutate"
  | "knowledge_then_action";

export type EvidenceSufficiency = "enough" | "partial" | "none";

export interface IntentDecision {
  route: AgentRoute;
  confidence: number;
  reason: string;
  requestedToolNames: string[];
  /** Structured arguments extracted for an exactly selected Skill tool. */
  requestedToolInput?: Record<string, unknown>;
  explicitActionEvidence: string | null;
  /** Consumer Skills deterministically matched for this turn. */
  matchedSkillNames?: string[];
}

export interface KnowledgeEvidence {
  content: string;
  title?: string;
  url?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface EvidenceBundle {
  items: KnowledgeEvidence[];
  citations: string[];
  sufficiency: EvidenceSufficiency;
  rawSummary?: string;
  sourceSummaries: string[];
  attemptedSources: string[];
  completedSources: string[];
}

export interface SpotlightToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  displayName: string;
}

export type SpotlightKnowledgeToolStreamEvent =
  | {
      type: "start";
      call: SpotlightToolCallInfo;
    }
  | {
      type: "progress";
      call: SpotlightToolCallInfo;
      summary: string;
    }
  | {
      type: "result";
      call: SpotlightToolCallInfo;
      success: boolean;
      summary: string;
      output?: unknown;
      error?: string;
    };

export interface KnowledgeQuery {
  query: string;
  projectId: string;
  sessionId: string;
  limit?: number;
  signal?: AbortSignal;
  onToolEvent?: (event: SpotlightKnowledgeToolStreamEvent) => void;
}

export interface KnowledgeProvider {
  readonly id: string;
  search(input: KnowledgeQuery): Promise<KnowledgeEvidence[]>;
}

export interface WebSearchProvider {
  readonly id: string;
  search(input: KnowledgeQuery): Promise<KnowledgeEvidence[]>;
}

export type ServerToolDomain = "knowledge" | "web" | "project";
export type ServerToolEffect = "read" | "write" | "external";

export interface ServerToolMetadata {
  domain: ServerToolDomain;
  effect: ServerToolEffect;
  risk: "low" | "medium" | "high";
}

export interface SpotlightServerTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  metadata: ServerToolMetadata;
  invoke(input: Record<string, unknown>, context: RunContext): Promise<unknown>;
}

export interface ProjectPack {
  projectId: string;
  systemPrompt?: string;
  clarificationPrompt?: string;
  knowledgeProvider?: KnowledgeProvider;
  webSearchProvider?: WebSearchProvider;
  serverTools: SpotlightServerTool[];
  uiPrompts?: Record<string, unknown>;
  videoChannels?: Array<{ id: string; name: string; aliases: string[] }>;
}

export interface HostActionCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  displayName: string;
}

export interface HostActionBridge {
  request(call: HostActionCall): Promise<HostToolResultRequest>;
}

export interface RunContext {
  request: CreateRunRequest & {
    memorySubjectId?: string;
    clientToolManifest?: {
      tools: FrontendToolDescriptorV1[];
    };
  };
  runId: string;
  project: ProjectPack;
  host: HostActionBridge;
  signal: AbortSignal;
}

export interface SpotlightRunResult {
  route: AgentRoute;
  assistantReply: string;
  decision: IntentDecision;
  invokedClientTools: string[];
}
