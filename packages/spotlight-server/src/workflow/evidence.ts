import type {
  EvidenceBundle,
  EvidenceSufficiency,
  KnowledgeEvidence,
} from "../contracts.js";

export function emptyEvidenceBundle(): EvidenceBundle {
  return {
    items: [],
    citations: [],
    sufficiency: "none",
    sourceSummaries: [],
    attemptedSources: [],
    completedSources: [],
  };
}

export function resetEvidenceBundle(): EvidenceBundle {
  return { ...emptyEvidenceBundle(), turnReset: true };
}

const INTERNAL_EVIDENCE_TITLES = new Set([
  "hikari answer",
  "yuxi project knowledge",
  "spotlight knowledge",
  "tavily answer",
]);

export function isInternalEvidenceTitle(title: string | undefined): boolean {
  return INTERNAL_EVIDENCE_TITLES.has(title?.trim().toLowerCase() ?? "");
}

export function applyEvidenceUpdate(
  left: EvidenceBundle,
  right: EvidenceBundle,
): EvidenceBundle {
  if (right.turnReset) {
    const { turnReset: _ignored, ...rest } = right;
    if (!rest.items.length && !rest.attemptedSources.length) {
      return emptyEvidenceBundle();
    }
    return rest;
  }
  if (!right.items.length && !right.attemptedSources.length) return left;
  if (!left.items.length && !left.attemptedSources.length) return right;
  return mergeEvidenceBundles(left, right);
}

export function evidenceFromSource(input: {
  source: string;
  items?: KnowledgeEvidence[];
  summary: string;
  attempted?: boolean;
  completed?: boolean;
  failed?: boolean;
}): EvidenceBundle {
  const items = input.items ?? [];
  const citations = [
    ...new Set(
      items
        .flatMap((item) => [item.title?.trim(), item.url?.trim()])
        .filter(
          (value): value is string =>
            Boolean(value) && !isInternalEvidenceTitle(value),
        ),
    ),
  ];
  let sufficiency: EvidenceSufficiency = "none";
  if (items.length > 0) sufficiency = input.failed ? "partial" : "enough";
  else if (input.failed || input.attempted) sufficiency = "none";
  return {
    items,
    citations,
    sufficiency,
    rawSummary: input.summary,
    sourceSummaries: [input.summary],
    attemptedSources: input.attempted || input.failed ? [input.source] : [],
    completedSources: input.completed ? [input.source] : [],
  };
}

function rank(value: EvidenceSufficiency): number {
  if (value === "none") return 0;
  if (value === "partial") return 1;
  return 2;
}

export function mergeEvidenceBundles(
  left: EvidenceBundle,
  right: EvidenceBundle,
): EvidenceBundle {
  const items = [...left.items, ...right.items];
  const citations = [...new Set([...left.citations, ...right.citations])];
  const attemptedSources = [
    ...new Set([...left.attemptedSources, ...right.attemptedSources]),
  ];
  const completedSources = [
    ...new Set([...left.completedSources, ...right.completedSources]),
  ];
  const sourceSummaries = [...left.sourceSummaries, ...right.sourceSummaries];
  let sufficiency: EvidenceSufficiency = "none";
  if (items.length === 0) sufficiency = "none";
  else if (attemptedSources.some((source) => !completedSources.includes(source))) {
    sufficiency = "partial";
  } else if (rank(left.sufficiency) === 2 && rank(right.sufficiency) === 2) {
    sufficiency = "enough";
  } else {
    sufficiency =
      rank(left.sufficiency) < rank(right.sufficiency)
        ? left.sufficiency
        : right.sufficiency;
    if (sufficiency === "none" && items.length > 0) sufficiency = "partial";
  }
  return {
    items,
    citations,
    sufficiency,
    rawSummary: [left.rawSummary, right.rawSummary].filter(Boolean).join("\n"),
    sourceSummaries,
    attemptedSources,
    completedSources,
  };
}
