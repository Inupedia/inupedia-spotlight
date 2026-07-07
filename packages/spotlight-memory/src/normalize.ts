const FILLER_PREFIX =
  /^(请问|帮我|帮忙|能不能|可以|麻烦|我想|我要|请|打开|查看|看一下|看看)/;

/** Normalize user question for cache keys and semantic index. */
export function normalizeQuestion(question: string): string {
  let text = question.trim().toLowerCase();
  text = text.replace(/\s+/g, "");
  text = text.replace(/[？?！!。．,，、；;：:""''（）()[\]【】]/g, "");
  text = text.replace(FILLER_PREFIX, "");
  return text;
}

/** Rough token-overlap score in [0, 1] — MVP semantic fallback without embeddings. */
export function scoreQuestionSimilarity(a: string, b: string): number {
  const left = normalizeQuestion(a);
  const right = normalizeQuestion(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return shorter / longer;
  }
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(left);
  const gb = grams(right);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  const union = ga.size + gb.size - inter;
  return union === 0 ? 0 : inter / union;
}
