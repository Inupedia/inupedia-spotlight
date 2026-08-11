export type SpotlightMemoryResultSource = "exact" | "semantic" | "session";

export function getSpotlightMemoryResultCopy(
  source?: SpotlightMemoryResultSource,
): {
  heading: string;
  description: string;
} {
  if (source === "semantic") {
    return {
      heading: "找到了高度相关的历史答案",
      description:
        "问题语义与项目内已有问答高度相似，Spotlight 已直接复用该结论。",
    };
  }
  return {
    heading: "找到了相同问题的历史答案",
    description: "该问题与项目内已有问答一致，Spotlight 已直接复用该结论。",
  };
}
