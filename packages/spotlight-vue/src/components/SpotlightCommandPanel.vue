<template>
  <div class="spotlight-backdrop" @click.self="store.close">
    <div
      class="spotlight-panel"
      role="dialog"
      aria-modal="true"
      aria-label="指令面板"
    >
      <div class="spotlight-command-deck">
        <div class="spotlight-command-deck-meta">
          <span v-if="deckKicker" class="spotlight-command-deck-kicker">{{
            deckKicker
          }}</span>
          <span class="spotlight-command-deck-status">{{ badgeLabel }}</span>
        </div>
        <button
          type="button"
          class="spotlight-apple-switch"
          role="switch"
          :aria-checked="memoryPreference.enabled"
          :aria-label="memoryPreference.enabled ? '关闭记忆' : '开启记忆'"
          @click="memoryPreference.toggle()"
        >
          <span
            class="spotlight-apple-switch-track"
            :class="{ 'is-on': memoryPreference.enabled }"
          >
            <span class="spotlight-apple-switch-thumb" />
          </span>
          <span class="spotlight-apple-switch-label">记忆</span>
        </button>
      </div>
      <div
        v-if="store.pendingSkillPermission"
        class="spotlight-permission-banner"
        role="alertdialog"
        aria-label="Skill 权限确认"
      >
        <div class="spotlight-permission-banner-body">
          <strong>{{
            store.pendingSkillPermission.displayName ??
            store.pendingSkillPermission.skillName
          }}</strong>
          <span>{{ store.pendingSkillPermission.reason }}</span>
        </div>
        <div class="spotlight-permission-banner-actions">
          <button
            type="button"
            class="spotlight-permission-btn is-approve"
            @click="store.approvePendingSkillPermission()"
          >
            允许
          </button>
          <button
            type="button"
            class="spotlight-permission-btn is-dismiss"
            @click="store.clearPendingSkillPermission()"
          >
            取消
          </button>
        </div>
      </div>
      <InspiraCardSpotlight
        class="spotlight-input-shell"
        :gradient-size="260"
        gradient-color="rgba(10, 132, 255, 0.12)"
        :gradient-opacity="1"
      >
        <div
          v-if="voiceHoldActive || speechPending"
          class="spotlight-voice-shell"
          :class="{
            'is-recording': voiceHoldActive,
            'is-transcribing': speechPending,
          }"
        >
          <OfficialBorderBeam
            class="spotlight-voice-beam"
            :size="86"
            :duration="6"
            :border-width="1.5"
            color-from="#c9a25d"
            color-to="#5d8f9b"
          />
          <div class="spotlight-voice-mic" aria-hidden="true">
            <span class="spotlight-voice-mic-icon">
              <span class="spotlight-voice-mic-body" />
              <span class="spotlight-voice-mic-stem" />
            </span>
          </div>
          <div class="spotlight-voice-text">
            {{
              voiceHoldActive
                ? `正在录音，松开 ${voiceKeyLabel} 结束`
                : "语音识别中，请稍候…"
            }}
          </div>
        </div>
        <div v-else class="spotlight-input-wrap" :class="`is-${uiState}`">
          <!-- prettier-ignore -->
          <input
            ref="inputRef"
            v-model="store.prompt"
            class="spotlight-input"
            type="text"
            :placeholder="placeholder"
            @keydown.enter.prevent="store.handleEnter"
            @keydown.down.prevent="store.selectNext"
            @keydown.up.prevent="store.selectPrev"
          >
          <div class="spotlight-agent-badge" :class="`is-${uiState}`">
            <span class="spotlight-agent-badge-dot" />
            <span>{{ badgeLabel }}</span>
          </div>
        </div>
      </InspiraCardSpotlight>
      <div
        v-if="
          !store.prompt.trim() &&
          !store.loading &&
          !voiceHoldActive &&
          !speechPending
        "
        class="spotlight-list-shell"
      >
        <ul class="spotlight-list" role="listbox">
          <li
            v-for="(q, i) in store.suggestedQuestions"
            :key="`suggested-${i}`"
            class="spotlight-item"
            :class="{ 'is-selected': store.selectedIndex === i }"
            role="option"
            :aria-selected="store.selectedIndex === i"
            @click="onSelectQuestion(i)"
          >
            <span class="spotlight-item-label">{{ q }}</span>
            <span class="spotlight-item-hint">推荐</span>
          </li>
          <li
            v-if="
              store.suggestedQuestions.length > 0 &&
              store.recentQuestions.length > 0
            "
            class="spotlight-list-divider"
          >
            <span>历史问题</span>
          </li>
          <li
            v-for="(q, i) in store.recentQuestions"
            :key="`recent-${i}`"
            class="spotlight-item"
            :class="{
              'is-selected':
                store.selectedIndex === i + store.suggestedQuestions.length,
            }"
            role="option"
            :aria-selected="
              store.selectedIndex === i + store.suggestedQuestions.length
            "
            @click="onSelectQuestion(i + store.suggestedQuestions.length)"
          >
            <span class="spotlight-item-label">{{ q }}</span>
            <span class="spotlight-item-hint">历史</span>
          </li>
          <li
            v-if="
              store.suggestedQuestions.length === 0 &&
              store.recentQuestions.length === 0
            "
            class="spotlight-item spotlight-item--empty"
          >
            <span class="spotlight-item-label">暂无推荐问法</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, toRef } from "vue";
import { storeToRefs } from "pinia";
import { useSpotlightStore } from "../store/spotlightStore.js";
import { useSpotlightMemoryPreferenceStore } from "../store/memoryPreferenceStore.js";
import { useSpotlightPanelUi } from "../composables/useSpotlightPanelUi.js";
import InspiraCardSpotlight from "./InspiraCardSpotlight.vue";
import OfficialBorderBeam from "./OfficialBorderBeam.vue";

const props = withDefaults(
  defineProps<{
    deckKicker?: string;
    voiceHoldActive?: boolean;
    speechPending?: boolean;
    voiceKeyLabel?: string;
  }>(),
  {
    deckKicker: "",
    voiceHoldActive: false,
    speechPending: false,
    voiceKeyLabel: "`",
  },
);

const store = useSpotlightStore();
const memoryPreference = useSpotlightMemoryPreferenceStore();
const { loading, pipelinePhase, lastMemoryReplay } = storeToRefs(store);
const inputRef = ref<HTMLInputElement | null>(null);

const { uiState, placeholder, badgeLabel } = useSpotlightPanelUi({
  pipelinePhase,
  loading,
  memoryReplay: lastMemoryReplay,
  voiceHoldActive: toRef(props, "voiceHoldActive"),
  speechPending: toRef(props, "speechPending"),
  voiceKeyLabel: props.voiceKeyLabel,
});

function onSelectQuestion(index: number) {
  store.fillPromptWithRecent(index);
  nextTick(() => inputRef.value?.focus());
}

function focusInput() {
  nextTick(() => inputRef.value?.focus());
}

defineExpose({ focusInput });
</script>

<style scoped>
@import "../styles/spotlight-command-panel.css";
</style>
