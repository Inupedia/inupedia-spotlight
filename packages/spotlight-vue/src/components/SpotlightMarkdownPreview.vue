<template>
  <MdPreview
    :id="editorId"
    :model-value="displayValue"
    theme="dark"
    preview-theme="github"
    code-theme="github"
    class="thinking-bar-md-preview"
  />
</template>

<script setup lang="ts">
import { MdPreview } from "md-editor-v3";
import { computed, ref, watch } from "vue";
import {
  formatSpotlightKnowledgeMarkdown,
  preprocessKnowledgeMarkdown,
} from "../store/pipeline/spotlightMarkdown.js";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    formatKnowledge?: boolean;
    editorId?: string;
  }>(),
  {
    formatKnowledge: false,
    editorId: "spotlight-knowledge-preview",
  },
);

const formattedValue = ref("");
let formatGeneration = 0;

const displayValue = computed(() => {
  if (!props.formatKnowledge) return props.modelValue;
  return formattedValue.value || preprocessKnowledgeMarkdown(props.modelValue);
});

watch(
  () => [props.modelValue, props.formatKnowledge] as const,
  async ([value, shouldFormat]) => {
    if (!shouldFormat) {
      formattedValue.value = "";
      return;
    }
    const generation = ++formatGeneration;
    const next = await formatSpotlightKnowledgeMarkdown(value);
    if (generation === formatGeneration) {
      formattedValue.value = next;
    }
  },
  { immediate: true },
);
</script>
