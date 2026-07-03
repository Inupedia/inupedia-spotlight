<script setup lang="ts">
import { computed } from "vue";

interface BorderBeamProps {
  size?: number;
  duration?: number;
  borderWidth?: number;
  anchor?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
}

const props = withDefaults(defineProps<BorderBeamProps>(), {
  size: 200,
  duration: 15,
  anchor: 90,
  borderWidth: 1.5,
  colorFrom: "#ffaa40",
  colorTo: "#9c40ff",
  delay: 0,
});

const durationInSeconds = computed(() => `${props.duration}s`);
const delayInSeconds = computed(() => `${props.delay}s`);
</script>

<template>
  <div class="border-beam-official" />
</template>

<style scoped>
.border-beam-official {
  --size: v-bind(size);
  --duration: v-bind(durationInSeconds);
  --anchor: v-bind(anchor);
  --border-width: v-bind(borderWidth);
  --color-from: v-bind(colorFrom);
  --color-to: v-bind(colorTo);
  --delay: v-bind(delayInSeconds);
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  border: calc(var(--border-width) * 1px) solid transparent;
  mask-image:
    linear-gradient(transparent, transparent), linear-gradient(white, white);
  mask-clip: padding-box, border-box;
  mask-composite: intersect;
  -webkit-mask-image:
    linear-gradient(transparent, transparent), linear-gradient(white, white);
  -webkit-mask-clip: padding-box, border-box;
  -webkit-mask-composite: source-in;
}

.border-beam-official::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: calc(var(--size) * 1px);
  aspect-ratio: 1 / 1;
  background: linear-gradient(
    to left,
    var(--color-from),
    var(--color-to),
    transparent
  );
  offset-anchor: calc(var(--anchor) * 1%) 50%;
  offset-path: rect(0 auto auto 0 round calc(var(--size) * 1px));
  animation: border-beam-official-anim var(--duration) infinite linear;
  animation-delay: var(--delay);
}

@keyframes border-beam-official-anim {
  to {
    offset-distance: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .border-beam-official::after {
    animation: none;
  }
}
</style>
