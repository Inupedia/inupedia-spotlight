import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Live2D 浮层：默认隐藏，按 ⌘/Ctrl+L 显示/隐藏人物。
 */
export const useLive2dOverlayStore = defineStore("live2dOverlay", () => {
  const visible = ref(false);

  function toggle() {
    visible.value = !visible.value;
  }

  function show() {
    visible.value = true;
  }

  function hide() {
    visible.value = false;
  }

  return { visible, toggle, show, hide };
});
