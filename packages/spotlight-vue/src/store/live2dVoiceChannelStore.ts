import { defineStore } from "pinia";
import { ref } from "vue";

/** 数字人浮层下的语音通道 UI（与 GlobalSpotlight 长按 ` 键同步） */
export const useLive2dVoiceChannelStore = defineStore(
  "live2dVoiceChannel",
  () => {
    const recording = ref(false);
    const transcribing = ref(false);

    function setRecording(on: boolean) {
      recording.value = on;
      if (on) transcribing.value = false;
    }

    function setTranscribing(on: boolean) {
      transcribing.value = on;
      if (on) recording.value = false;
    }

    function reset() {
      recording.value = false;
      transcribing.value = false;
    }

    return { recording, transcribing, setRecording, setTranscribing, reset };
  },
);
