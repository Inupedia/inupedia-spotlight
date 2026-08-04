<template>
  <Teleport to="body">
    <SpotlightCommandPanel
      v-if="store.visible"
      ref="panelRef"
      :deck-kicker="deckKicker"
      :voice-hold-active="voiceHoldActive"
      :speech-pending="speechPending"
      :voice-key-label="voiceKeyLabel"
    />
    <SpotlightThinking
      v-if="showThinking"
      :steps="store.agentSteps"
      :centered="thinkingCentered"
      :memory-replay="store.lastMemoryReplay"
      :memory-decision="store.lastMemoryDecision"
      @force-refresh="store.forceRefreshLastAnswer"
      @close="store.closeThinking"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useSpotlightStore } from "../store/spotlightStore.js";
import { useSpotlightCommandShortcuts } from "../composables/useSpotlightCommandShortcuts.js";
import SpotlightCommandPanel from "./SpotlightCommandPanel.vue";
import SpotlightThinking from "./SpotlightThinking.vue";

const props = withDefaults(
  defineProps<{
    deckKicker?: string;
    voiceHoldActive?: boolean;
    speechPending?: boolean;
    voiceKeyLabel?: string;
    /** Override default `store.showThinkingBar` visibility. */
    showThinking?: boolean;
    thinkingCentered?: boolean;
    onEscape?: () => void;
    onKeydown?: (event: KeyboardEvent) => void;
    onKeyup?: (event: KeyboardEvent) => void;
  }>(),
  {
    deckKicker: "",
    voiceHoldActive: false,
    speechPending: false,
    voiceKeyLabel: "`",
    thinkingCentered: false,
  },
);

const emit = defineEmits<{
  visibleChange: [visible: boolean];
}>();

const store = useSpotlightStore();
const { visible, showThinkingBar } = storeToRefs(store);
const panelRef = ref<InstanceType<typeof SpotlightCommandPanel> | null>(null);

const showThinking = computed(
  () => props.showThinking ?? showThinkingBar.value,
);

useSpotlightCommandShortcuts({
  visible,
  showThinkingBar,
  open: () => store.open(),
  close: () => store.close(),
  closeThinking: () => store.closeThinking(),
  onEscape: props.onEscape,
  onKeydown: props.onKeydown,
  onKeyup: props.onKeyup,
});

watch(visible, (next) => {
  emit("visibleChange", next);
  if (next) {
    panelRef.value?.focusInput();
  }
});
</script>
