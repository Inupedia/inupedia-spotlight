import { computed, type Ref } from "vue";

export type SpotlightPanelUiState = "idle" | "running" | "done" | "error";

export type UseSpotlightPanelUiOptions = {
  pipelinePhase: Ref<string>;
  loading: Ref<boolean>;
  voiceHoldActive?: Ref<boolean>;
  speechPending?: Ref<boolean>;
  voiceKeyLabel?: string;
};

export function useSpotlightPanelUi(options: UseSpotlightPanelUiOptions) {
  const voiceKeyLabel = options.voiceKeyLabel ?? "`";

  const uiState = computed<SpotlightPanelUiState>(() => {
    if (options.pipelinePhase.value === "error") return "error";
    if (options.loading.value || options.pipelinePhase.value === "running") {
      return "running";
    }
    if (options.pipelinePhase.value === "done") return "done";
    return "idle";
  });

  const placeholder = computed(() => {
    if (options.voiceHoldActive?.value) {
      return `正在录音，松开 ${voiceKeyLabel} 结束并转写…`;
    }
    if (options.speechPending?.value) {
      return "语音识别中，请稍候…";
    }
    if (uiState.value === "running") {
      return "Agent 正在分析场景、路由工具和上下文…";
    }
    if (uiState.value === "done") {
      return "继续追问，或者换个角度继续盘它…";
    }
    if (uiState.value === "error") {
      return "刚才那轮跑岔了，换个问法再试试…";
    }
    return "输入问题或从下方选择历史…";
  });

  const badgeLabel = computed(() => {
    if (options.voiceHoldActive?.value) return "语音录制中";
    if (options.speechPending?.value) return "语音识别中";
    if (uiState.value === "running") return "Agent 执行中";
    if (uiState.value === "done") return "已完成";
    if (uiState.value === "error") return "执行异常";
    return "等待提问";
  });

  return { uiState, placeholder, badgeLabel };
}
