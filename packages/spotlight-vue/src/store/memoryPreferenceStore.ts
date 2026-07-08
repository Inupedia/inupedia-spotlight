import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

const STORAGE_KEY = "spotlight-memory-enabled";

function readInitialEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return true;
    if (raw === "false") return false;
    if (raw === "true") return true;
    const parsed = JSON.parse(raw) as { enabled?: boolean };
    if (typeof parsed.enabled === "boolean") return parsed.enabled;
    return true;
  } catch {
    return true;
  }
}

/** 用户是否启用 Gate + Agent 文件记忆（持久化到 localStorage）。 */
export const useSpotlightMemoryPreferenceStore = defineStore(
  "spotlightMemoryPreference",
  () => {
    const enabled = ref(readInitialEnabled());

    watch(
      enabled,
      (value) => {
        try {
          localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
        } catch {
          // ignore quota / private mode
        }
      },
      { immediate: true },
    );

    return {
      enabled,
      memoryEnabled: computed(() => enabled.value),
      setEnabled(value: boolean) {
        enabled.value = value;
      },
      toggle() {
        enabled.value = !enabled.value;
      },
    };
  },
);

export function readSpotlightMemoryEnabled(): boolean {
  return readInitialEnabled();
}
