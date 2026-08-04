export const SPOTLIGHT_MEMORY_PREFERENCE_LABEL = "使用记忆";

const MEMORY_ACCUMULATION_NOTE =
  "关闭后不参考历史记忆，但仍允许系统积累项目知识。";

export function getSpotlightMemoryPreferenceCopy(enabled: boolean): {
  ariaLabel: string;
  title: string;
} {
  if (enabled) {
    return {
      ariaLabel: `使用记忆已开启。点击关闭；${MEMORY_ACCUMULATION_NOTE}`,
      title: `已开启：回答会参考历史记忆。${MEMORY_ACCUMULATION_NOTE}`,
    };
  }

  return {
    ariaLabel:
      "使用记忆已关闭。点击开启；当前不参考历史记忆，但仍允许系统积累项目知识。",
    title: "已关闭：回答不参考历史记忆，但仍允许系统积累项目知识。",
  };
}
