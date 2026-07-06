<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@inspira-ui/plugins";
import { computed, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    slotClass?: HTMLAttributes["class"];
    gradientSize?: number;
    gradientColor?: string;
    gradientOpacity?: number;
  }>(),
  {
    class: "",
    slotClass: "",
    gradientSize: 220,
    gradientColor: "rgba(56, 189, 248, 0.22)",
    gradientOpacity: 1,
  },
);

const mouseX = ref(-props.gradientSize * 10);
const mouseY = ref(-props.gradientSize * 10);

function handleMouseMove(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  mouseX.value = event.clientX - rect.left;
  mouseY.value = event.clientY - rect.top;
}

function handleMouseLeave() {
  mouseX.value = -props.gradientSize * 10;
  mouseY.value = -props.gradientSize * 10;
}

onMounted(() => {
  handleMouseLeave();
});

const backgroundStyle = computed(() => {
  return `radial-gradient(circle at ${mouseX.value}px ${mouseY.value}px, ${props.gradientColor} 0%, rgba(0, 0, 0, 0) 70%)`;
});
</script>

<template>
  <div
    :class="
      cn(
        'inspira-card-spotlight group relative flex size-full overflow-hidden rounded-xl',
        props.class,
      )
    "
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <div
      :class="
        cn(
          'inspira-card-spotlight__content relative z-10 size-full',
          props.slotClass,
        )
      "
    >
      <slot />
    </div>
    <div
      class="inspira-card-spotlight__gradient pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      :style="{
        background: backgroundStyle,
        opacity: gradientOpacity,
      }"
    />
  </div>
</template>

<style scoped>
.inspira-card-spotlight {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  border-radius: 12px;
}

.inspira-card-spotlight__content {
  position: relative;
  z-index: 10;
  width: 100%;
  min-width: 0;
  height: 100%;
}

.inspira-card-spotlight__gradient {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.inspira-card-spotlight:hover .inspira-card-spotlight__gradient {
  opacity: 1;
}
</style>
