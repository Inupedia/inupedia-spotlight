import type {
  IntentDecision,
  KnowledgeSource,
  WorkflowLane,
} from "./contracts.js";

/**
 * Questions that need unpublished / in-product facts.
 * Everything else on the knowledge lane prefers public web search when it exists,
 * because the project knowledge base (Yuxi) is too slow to run "just in case".
 */
const PROJECT_KNOWLEDGE_PATTERN =
  /这个模块|模块含义|本系统|本平台|当前页面|当前界面|知识库|内部资料|项目资料|工程档案|本工程|界面上|系统里|平台里的|这个功能|这个面板|这个按钮|指标含义/iu;

export function prefersProjectKnowledgeBase(question: string): boolean {
  return PROJECT_KNOWLEDGE_PATTERN.test(question.trim());
}

export function inferKnowledgeSource(question: string): KnowledgeSource {
  return prefersProjectKnowledgeBase(question) ? "knowledge" : "web";
}

export function attachKnowledgeSource(
  question: string,
  decision: IntentDecision,
): IntentDecision {
  if (decision.route !== "knowledge") return decision;
  return {
    ...decision,
    knowledgeSource: inferKnowledgeSource(question),
  };
}

export function resolveGatherSources(input: {
  question: string;
  lane: WorkflowLane;
  knowledgeSource?: KnowledgeSource;
  hasKnowledge: boolean;
  hasWeb: boolean;
  hasServer: boolean;
}): { knowledge: boolean; web: boolean; server: boolean } {
  const server = input.hasServer;
  const preferred: KnowledgeSource =
    input.lane === "knowledge_then_action"
      ? "knowledge"
      : (input.knowledgeSource ?? inferKnowledgeSource(input.question));

  if (preferred === "web") {
    if (input.hasWeb) return { knowledge: false, web: true, server };
    if (input.hasKnowledge) return { knowledge: true, web: false, server };
    return { knowledge: false, web: false, server };
  }
  if (input.hasKnowledge) return { knowledge: true, web: false, server };
  if (input.hasWeb) return { knowledge: false, web: true, server };
  return { knowledge: false, web: false, server };
}
