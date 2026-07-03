import { defineStore } from "pinia";
import { ref } from "vue";

export const useLive2dSpeechStore = defineStore("live2dSpeech", () => {
  const message = ref("");
  const speaking = ref(false);
  /** 为 true 时气泡一次性显示全文（与 TTS 播放对齐，避免打字机滞后于语音） */
  const revealInstant = ref(false);

  function start(messageText: string, options?: { instant?: boolean }) {
    message.value = messageText.trim();
    revealInstant.value = options?.instant ?? false;
    speaking.value = true;
  }

  function finish() {
    speaking.value = false;
  }

  function reset() {
    message.value = "";
    speaking.value = false;
    revealInstant.value = false;
  }

  return { message, speaking, revealInstant, start, finish, reset };
});
