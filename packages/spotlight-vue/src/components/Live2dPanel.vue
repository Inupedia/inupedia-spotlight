<template>
  <div class="live2d-panel-shell">
    <div id="live2d-container" class="live2d-panel" aria-label="Live2D" />
    <Transition name="speech-bubble">
      <div
        v-if="speechVisible"
        class="live2d-speech-bubble"
        :class="{ 'is-speaking': speaking }"
      >
        <div class="live2d-speech-head">
          <span class="live2d-speech-dot" />
          <span>{{ avatarConfig.bubbleTitle ?? "数字人" }}</span>
        </div>
        <p class="live2d-speech-text">{{ animatedText }}</p>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { startLive2dApp, stopLive2dApp } from "../avatar/spine/live2dApp.js";
import { configureSpineAvatar } from "../avatar/spine/spineAvatar.js";
import { useSpotlightAvatarConfig } from "../avatar/config.js";
import { useLive2dSpeechStore } from "../store/live2dSpeechStore.js";

const speechStore = useLive2dSpeechStore();
const avatarConfig = useSpotlightAvatarConfig();
const { message, speaking, revealInstant } = storeToRefs(speechStore);
const animatedText = ref("");
let typingTimer: number | null = null;

const speechVisible = computed(() => {
  return speaking.value || message.value.trim().length > 0;
});

function clearTypingTimer() {
  if (typingTimer != null) {
    window.clearInterval(typingTimer);
    typingTimer = null;
  }
}

watch(
  () => [message.value, revealInstant.value] as const,
  ([text, instant]) => {
    clearTypingTimer();
    const normalized = text.trim();
    if (!normalized) {
      animatedText.value = "";
      return;
    }

    if (instant) {
      animatedText.value = normalized;
      return;
    }

    animatedText.value = "";
    let index = 0;
    typingTimer = window.setInterval(() => {
      index += 1;
      animatedText.value = normalized.slice(0, index);
      if (index >= normalized.length) {
        clearTypingTimer();
      }
    }, 24);
  },
  { immediate: true },
);

onMounted(async () => {
  configureSpineAvatar(avatarConfig);
  await startLive2dApp();
});

onUnmounted(() => {
  clearTypingTimer();
  speechStore.reset();
  stopLive2dApp();
});
</script>

<style scoped>
.live2d-panel-shell {
  position: fixed;
  right: 220px;
  bottom: 16px;
  z-index: 5000;
  width: min(420px, 42vw);
  height: min(560px, 52vh);
  pointer-events: none;
}

.live2d-panel {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  touch-action: none;
  background: transparent;
}

.live2d-speech-bubble {
  position: absolute;
  right: calc(100% - 36px);
  bottom: 44%;
  width: min(360px, 40vw);
  max-height: 32vh;
  overflow: hidden auto;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: linear-gradient(
    165deg,
    rgba(255, 255, 255, 0.96),
    rgba(240, 253, 250, 0.94)
  );
  box-shadow:
    0 18px 36px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  color: #0f172a;
  padding: 10px 12px;
  pointer-events: auto;
}

.live2d-speech-bubble.is-speaking {
  border-color: rgba(20, 184, 166, 0.45);
  box-shadow:
    0 20px 40px rgba(20, 184, 166, 0.14),
    0 0 0 1px rgba(14, 165, 233, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.live2d-speech-head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #0d9488;
  font-size: 12px;
  line-height: 1;
}

.live2d-speech-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentcolor;
  box-shadow: 0 0 12px currentcolor;
}

.live2d-speech-bubble.is-speaking .live2d-speech-dot {
  animation: speech-pulse 1.1s ease-in-out infinite;
}

.live2d-speech-text {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.55;
  color: #334155;
}

.speech-bubble-enter-active,
.speech-bubble-leave-active {
  transition: all 0.28s ease;
}

.speech-bubble-enter-from,
.speech-bubble-leave-to {
  opacity: 0;
  transform: translateX(10px) scale(0.98);
}

@keyframes speech-pulse {
  0% {
    opacity: 0.65;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.12);
  }
  100% {
    opacity: 0.65;
    transform: scale(0.95);
  }
}
</style>
