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
  /** Stronger halo for memory / active states */
  intense?: boolean;
}

const props = withDefaults(defineProps<BorderBeamProps>(), {
  size: 200,
  duration: 15,
  anchor: 90,
  borderWidth: 1.5,
  colorFrom: "#ffaa40",
  colorTo: "#9c40ff",
  delay: 0,
  intense: false,
});

const durationInSeconds = computed(() => `${props.duration}s`);
const delayInSeconds = computed(() => `${props.delay}s`);
</script>

<template>
  <div
    class="border-beam-official"
    :class="{ 'border-beam-official--intense': intense }"
  />
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

.border-beam-official::before {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-from) 55%, transparent),
    color-mix(in srgb, var(--color-to) 55%, transparent)
  );
  opacity: 0;
  filter: blur(10px);
  transition: opacity 0.28s ease;
  z-index: -1;
}

.border-beam-official--intense::before {
  opacity: 0.75;
  animation: border-beam-official-glow 4.2s ease-in-out infinite;
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
    color-mix(in srgb, var(--color-to) 40%, transparent),
    transparent
  );
  filter: saturate(1.25) brightness(1.05);
  offset-anchor: calc(var(--anchor) * 1%) 50%;
  offset-path: rect(0 auto auto 0 round calc(var(--size) * 1px));
  animation: border-beam-official-anim var(--duration) infinite linear;
  animation-delay: var(--delay);
}

.border-beam-official--intense::after {
  width: calc(var(--size) * 1.15px);
  filter: saturate(1.45) brightness(1.12);
}

@keyframes border-beam-official-anim {
  to {
    offset-distance: 100%;
  }
}

@keyframes border-beam-official-glow {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.98);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.02);
  }
}

@media (prefers-reduced-motion: reduce) {
  .border-beam-official::after,
  .border-beam-official--intense::before {
    animation: none;
  }

  .border-beam-official--intense::before {
    opacity: 0.5;
  }
}
</style>
