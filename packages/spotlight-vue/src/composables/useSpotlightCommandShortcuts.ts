import { onMounted, onUnmounted, type Ref } from "vue";

export type SpotlightCommandShortcutsOptions = {
  visible: Ref<boolean>;
  showThinkingBar: Ref<boolean>;
  open: () => void;
  close: () => void;
  closeThinking: () => void;
  onEscape?: () => void;
  onKeydown?: (event: KeyboardEvent) => void;
  onKeyup?: (event: KeyboardEvent) => void;
};

export function useSpotlightCommandShortcuts(
  options: SpotlightCommandShortcutsOptions,
) {
  function handleKeydown(event: KeyboardEvent) {
    options.onKeydown?.(event);
    if (event.defaultPrevented) return;

    const key = event.key.toLowerCase();
    const isMeta = event.metaKey || event.ctrlKey;

    if (isMeta && key === "k") {
      event.preventDefault();
      if (options.visible.value) {
        options.close();
      } else {
        options.open();
      }
      return;
    }

    if (key === "escape") {
      event.preventDefault();
      if (options.onEscape) {
        options.onEscape();
        return;
      }
      if (options.showThinkingBar.value) {
        options.closeThinking();
      } else if (options.visible.value) {
        options.close();
      }
    }
  }

  function handleKeyup(event: KeyboardEvent) {
    options.onKeyup?.(event);
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeydown, true);
    window.addEventListener("keyup", handleKeyup, true);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeydown, true);
    window.removeEventListener("keyup", handleKeyup, true);
  });
}
