<template>
  <div
    class="thinking-bar"
    :class="[
      { 'thinking-bar--embedded': embedded },
      { 'thinking-bar--open': isOpen },
      { 'thinking-bar--centered': centered },
      { 'thinking-bar--corner': !centered && !embedded },
    ]"
  >
    <div class="thinking-bar-grid" aria-hidden="true" />
    <div class="thinking-bar-header">
      <div class="thinking-bar-title-stack">
        <span class="thinking-bar-kicker">HYDRO PROCESS</span>
        <span class="thinking-bar-title">{{ titleText }}</span>
      </div>
      <div class="thinking-bar-metrics" aria-label="执行状态概览">
        <span class="thinking-bar-metric">
          <strong>{{ steps.length }}</strong>
          <em>阶段</em>
        </span>
        <span class="thinking-bar-metric">
          <strong>{{ activeStepCount }}</strong>
          <em>运行</em>
        </span>
        <span class="thinking-bar-metric">
          <strong>{{ doneStepCount }}</strong>
          <em>完成</em>
        </span>
      </div>
      <button
        type="button"
        class="thinking-bar-close"
        aria-label="关闭"
        @click="$emit('close')"
      >
        ×
      </button>
    </div>
    <div ref="stepsContainerRef" class="thinking-bar-steps">
      <div
        v-for="step in steps"
        :key="step.id"
        class="thinking-bar-step"
        :class="[step.status]"
      >
        <OfficialBorderBeam
          v-if="step.status === 'active'"
          class="thinking-bar-step-beam"
          :size="88"
          :duration="6"
          :border-width="1.5"
          color-from="#c9a25d"
          color-to="#5d8f9b"
        />
        <div class="thinking-bar-step-inner">
          <span class="thinking-bar-step-icon">{{
            stepIcon(step.status)
          }}</span>
          <div class="thinking-bar-step-column">
            <span class="thinking-bar-step-label">{{ step.label }}</span>
            <div
              :ref="(el) => setStepBodyRef(step.id, el)"
              class="thinking-bar-step-body"
              @scroll.passive="handleStepBodyScroll(step.id, $event)"
            >
              <template v-if="isToolExecutionStep(step.id)">
                <div class="thinking-bar-tool-step-flow">
                  <details
                    v-if="hasExecutionDetails(step)"
                    class="thinking-bar-execution-details"
                  >
                    <summary class="thinking-bar-execution-details-summary">
                      <span class="thinking-bar-execution-details-title"
                        >调用工具</span
                      >
                      <span class="thinking-bar-execution-details-meta">{{
                        executionDetailsMeta(step)
                      }}</span>
                      <span class="thinking-bar-execution-details-caret"
                        >▾</span
                      >
                    </summary>
                    <div class="thinking-bar-execution-details-body">
                      <pre
                        v-if="getToolStepPlanning(step)"
                        class="thinking-bar-execution-planning"
                        >{{ getToolStepPlanning(step) }}</pre
                      >
                      <details
                        v-for="toolCall in getStepToolCalls(step)"
                        :key="toolCall.id"
                        class="thinking-bar-tool-call"
                        :open="isToolCallOpen(toolCall)"
                      >
                        <summary class="thinking-bar-tool-call-head">
                          <div class="thinking-bar-tool-call-head-main">
                            <span class="thinking-bar-tool-call-name">
                              {{ getToolTitle(toolCall) }}
                            </span>
                            <span
                              v-if="toolCall.name !== getToolTitle(toolCall)"
                              class="thinking-bar-tool-call-id"
                            >
                              {{ toolCall.name }}
                            </span>
                          </div>
                          <div class="thinking-bar-tool-call-head-side">
                            <span
                              class="thinking-bar-tool-call-status"
                              :class="`is-${toolCall.status}`"
                            >
                              {{ toolStatusLabel(toolCall.status) }}
                            </span>
                            <span class="thinking-bar-tool-call-caret">▾</span>
                          </div>
                        </summary>
                        <div class="thinking-bar-tool-call-body">
                          <div
                            v-if="toolCall.argsText?.trim()"
                            class="thinking-bar-tool-call-block"
                          >
                            <div class="thinking-bar-tool-call-block-title">
                              请求参数
                            </div>
                            <pre class="thinking-bar-tool-call-pre">{{
                              toolCall.argsText
                            }}</pre>
                          </div>
                          <div
                            v-if="toolCall.summary?.trim()"
                            class="thinking-bar-tool-call-block thinking-bar-tool-call-block--result"
                          >
                            <div class="thinking-bar-tool-call-block-title">
                              执行摘要
                            </div>
                            <pre class="thinking-bar-tool-call-pre">{{
                              toolCall.summary
                            }}</pre>
                          </div>
                          <div
                            v-if="hasStructuredToolResult(toolCall)"
                            class="thinking-bar-tool-call-block thinking-bar-tool-call-block--result"
                          >
                            <div class="thinking-bar-tool-call-block-title">
                              接口结果
                            </div>
                            <div
                              v-if="getToolResultImage(toolCall)"
                              class="thinking-bar-tool-result-image-shell"
                            >
                              <img
                                class="thinking-bar-tool-result-image"
                                :src="getToolResultImage(toolCall) || ''"
                                :alt="toolCall.name"
                              />
                            </div>
                            <iframe
                              v-else-if="getToolResultHtml(toolCall)"
                              class="thinking-bar-tool-result-html"
                              :srcdoc="getToolResultHtml(toolCall) || ''"
                              :title="toolCall.name"
                              sandbox=""
                            />
                            <div
                              v-else-if="getToolResultTable(toolCall)"
                              class="thinking-bar-tool-result-table-wrap"
                            >
                              <table class="thinking-bar-tool-result-table">
                                <thead>
                                  <tr>
                                    <th
                                      v-for="column in getToolResultTable(
                                        toolCall,
                                      )?.columns"
                                      :key="column"
                                    >
                                      {{ column }}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr
                                    v-for="(
                                      row, rowIndex
                                    ) in getToolResultTable(toolCall)?.rows"
                                    :key="`${toolCall.id}-${rowIndex}`"
                                  >
                                    <td
                                      v-for="column in getToolResultTable(
                                        toolCall,
                                      )?.columns"
                                      :key="`${toolCall.id}-${rowIndex}-${column}`"
                                    >
                                      {{ formatTableCell(row[column]) }}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <pre
                              v-else-if="getToolResultDisplay(toolCall)"
                              class="thinking-bar-tool-call-pre"
                              >{{ getToolResultDisplay(toolCall) }}</pre
                            >
                          </div>
                          <div
                            v-if="formatToolTrace(toolCall.trace)"
                            class="thinking-bar-tool-call-block"
                          >
                            <div class="thinking-bar-tool-call-block-title">
                              执行轨迹
                            </div>
                            <pre class="thinking-bar-tool-call-pre">{{
                              formatToolTrace(toolCall.trace)
                            }}</pre>
                          </div>
                          <div
                            v-if="toolCall.errorCode"
                            class="thinking-bar-tool-call-block thinking-bar-tool-call-block--error"
                          >
                            <div class="thinking-bar-tool-call-block-title">
                              错误码
                            </div>
                            <pre class="thinking-bar-tool-call-pre">{{
                              toolCall.errorCode
                            }}</pre>
                          </div>
                          <div
                            v-if="
                              isKnowledgeAnswerTool(toolCall) &&
                              getNestedKnowledgeToolCalls(step).length > 0
                            "
                            class="thinking-bar-nested-tools"
                          >
                            <div class="thinking-bar-nested-tools-label">
                              知识库内部步骤
                            </div>
                            <details
                              v-for="nested in getNestedKnowledgeToolCalls(
                                step,
                              )"
                              :key="nested.id"
                              class="thinking-bar-tool-call thinking-bar-tool-call--nested"
                            >
                              <summary class="thinking-bar-tool-call-head">
                                <div class="thinking-bar-tool-call-head-main">
                                  <span class="thinking-bar-tool-call-name">{{
                                    getToolTitle(nested)
                                  }}</span>
                                </div>
                                <div class="thinking-bar-tool-call-head-side">
                                  <span
                                    class="thinking-bar-tool-call-status"
                                    :class="`is-${nested.status}`"
                                  >
                                    {{ toolStatusLabel(nested.status) }}
                                  </span>
                                  <span class="thinking-bar-tool-call-caret"
                                    >▾</span
                                  >
                                </div>
                              </summary>
                              <div class="thinking-bar-tool-call-body">
                                <div
                                  v-if="nested.argsText?.trim()"
                                  class="thinking-bar-tool-call-block"
                                >
                                  <div
                                    class="thinking-bar-tool-call-block-title"
                                  >
                                    请求参数
                                  </div>
                                  <pre class="thinking-bar-tool-call-pre">{{
                                    nested.argsText
                                  }}</pre>
                                </div>
                                <div
                                  v-if="getToolResultDisplay(nested)"
                                  class="thinking-bar-tool-call-block"
                                >
                                  <div
                                    class="thinking-bar-tool-call-block-title"
                                  >
                                    接口结果
                                  </div>
                                  <pre class="thinking-bar-tool-call-pre">{{
                                    getToolResultDisplay(nested)
                                  }}</pre>
                                </div>
                              </div>
                            </details>
                          </div>
                        </div>
                      </details>
                    </div>
                  </details>
                  <section
                    v-if="getToolStepAnswer(step)"
                    class="thinking-bar-step-answer-section"
                  >
                    <div class="thinking-bar-step-section-label">回答</div>
                    <div
                      class="thinking-bar-step-text thinking-bar-step-markdown thinking-bar-step-answer"
                    >
                      <SpotlightMarkdownPreview
                        :model-value="getToolStepAnswer(step)"
                        format-knowledge
                      />
                    </div>
                  </section>
                </div>
              </template>
              <template v-else>
                <div
                  v-if="step.chatItems && step.chatItems.length > 0"
                  class="thinking-bar-chat-items"
                >
                  <div
                    v-for="item in step.chatItems"
                    :key="item.id"
                    class="thinking-bar-chat-item"
                  >
                    <div
                      v-if="item.type === 'text' && item.text.trim()"
                      class="thinking-bar-step-text thinking-bar-step-markdown"
                    >
                      <MdPreview
                        :model-value="humanizeSpotlightStepContent(item.text)"
                        theme="dark"
                        preview-theme="github"
                        code-theme="github"
                        class="thinking-bar-md-preview"
                      />
                    </div>
                    <details
                      v-else-if="item.type === 'tool'"
                      class="thinking-bar-tool-call"
                      :open="isToolCallOpen(item.toolCall)"
                    >
                      <summary class="thinking-bar-tool-call-head">
                        <div class="thinking-bar-tool-call-head-main">
                          <span class="thinking-bar-tool-call-name">
                            {{ getToolTitle(item.toolCall) }}
                          </span>
                        </div>
                        <div class="thinking-bar-tool-call-head-side">
                          <span
                            class="thinking-bar-tool-call-status"
                            :class="`is-${item.toolCall.status}`"
                          >
                            {{
                              item.toolCall.status === "done"
                                ? "已完成"
                                : item.toolCall.status === "error"
                                  ? "失败"
                                  : item.toolCall.status === "running"
                                    ? "执行中"
                                    : "待执行"
                            }}
                          </span>
                          <span class="thinking-bar-tool-call-caret">▾</span>
                        </div>
                      </summary>
                      <div class="thinking-bar-tool-call-body">
                        <div
                          v-if="hasStructuredToolResult(item.toolCall)"
                          class="thinking-bar-tool-call-block thinking-bar-tool-call-block--result"
                        >
                          <div class="thinking-bar-tool-call-block-title">
                            结果
                          </div>
                          <div
                            v-if="getToolResultImage(item.toolCall)"
                            class="thinking-bar-tool-result-image-shell"
                          >
                            <img
                              class="thinking-bar-tool-result-image"
                              :src="getToolResultImage(item.toolCall) || ''"
                              :alt="item.toolCall.name"
                            />
                          </div>
                          <iframe
                            v-else-if="getToolResultHtml(item.toolCall)"
                            class="thinking-bar-tool-result-html"
                            :srcdoc="getToolResultHtml(item.toolCall) || ''"
                            :title="item.toolCall.name"
                            sandbox=""
                          />
                          <div
                            v-else-if="getToolResultTable(item.toolCall)"
                            class="thinking-bar-tool-result-table-wrap"
                          >
                            <table class="thinking-bar-tool-result-table">
                              <thead>
                                <tr>
                                  <th
                                    v-for="column in getToolResultTable(
                                      item.toolCall,
                                    )?.columns"
                                    :key="column"
                                  >
                                    {{ column }}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr
                                  v-for="(row, rowIndex) in getToolResultTable(
                                    item.toolCall,
                                  )?.rows"
                                  :key="`${item.toolCall.id}-${rowIndex}`"
                                >
                                  <td
                                    v-for="column in getToolResultTable(
                                      item.toolCall,
                                    )?.columns"
                                    :key="`${item.toolCall.id}-${rowIndex}-${column}`"
                                  >
                                    {{ formatTableCell(row[column]) }}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <pre
                            v-else-if="getToolResultDisplay(item.toolCall)"
                            class="thinking-bar-tool-call-pre"
                            >{{ getToolResultDisplay(item.toolCall) }}</pre
                          >
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
                <div
                  v-else-if="step.content"
                  class="thinking-bar-step-text thinking-bar-step-markdown"
                >
                  <MdPreview
                    :model-value="
                      getIntentStepDisplayContent(step.content ?? '')
                    "
                    theme="dark"
                    preview-theme="github"
                    code-theme="github"
                    class="thinking-bar-md-preview"
                  />
                </div>
              </template>
              <div
                v-if="step.attachments && step.attachments.length > 0"
                class="thinking-bar-attachments"
              >
                <a
                  v-for="attachment in step.attachments"
                  :key="attachment.id"
                  class="thinking-bar-attachment"
                  :href="attachment.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    v-if="attachment.type === 'image'"
                    class="thinking-bar-attachment-image"
                    :src="attachment.url"
                    :alt="attachment.name || '图表预览'"
                  />
                  <div class="thinking-bar-attachment-meta">
                    <span class="thinking-bar-attachment-name">
                      {{ attachment.name || attachment.url }}
                    </span>
                    <span class="thinking-bar-attachment-type">
                      {{
                        attachment.type === "image"
                          ? "图片预览"
                          : attachment.type === "html"
                            ? "打开图表"
                            : "打开文件"
                      }}
                    </span>
                  </div>
                </a>
              </div>
              <div
                v-if="step.files && step.files.length > 0"
                class="thinking-bar-workspace"
              >
                <div class="thinking-bar-workspace-title">状态工作台</div>
                <div class="thinking-bar-workspace-shell">
                  <div class="thinking-bar-file-tree-pane">
                    <div class="thinking-bar-file-tree-head">文件系统</div>
                    <div class="thinking-bar-file-tree-body">
                      <template
                        v-for="node in getVisibleFileTree(step.id, step.files)"
                        :key="`${step.id}:${node.path}`"
                      >
                        <div
                          v-if="node.type === 'directory'"
                          class="thinking-bar-tree-node"
                        >
                          <button
                            type="button"
                            class="thinking-bar-tree-row thinking-bar-tree-row--directory"
                            :style="{
                              paddingLeft: `${node.depth * 14 + 10}px`,
                            }"
                            @click="toggleDirectory(step.id, node.path)"
                          >
                            <span class="thinking-bar-tree-caret">
                              {{
                                isDirectoryExpanded(step.id, node.path)
                                  ? "▾"
                                  : "▸"
                              }}
                            </span>
                            <span class="thinking-bar-tree-icon">📁</span>
                            <span class="thinking-bar-tree-label">{{
                              node.name
                            }}</span>
                          </button>
                        </div>
                        <button
                          v-else
                          type="button"
                          class="thinking-bar-tree-row thinking-bar-tree-row--file"
                          :class="{
                            active: getSelectedFile(step)?.id === node.file?.id,
                          }"
                          :style="{ paddingLeft: `${node.depth * 14 + 26}px` }"
                          @click="selectTreeFile(step.id, node.file)"
                        >
                          <span class="thinking-bar-tree-icon">
                            {{ getFileIcon(node.file?.path || "") }}
                          </span>
                          <span class="thinking-bar-tree-label">{{
                            node.name
                          }}</span>
                        </button>
                      </template>
                    </div>
                  </div>
                  <div class="thinking-bar-file-preview">
                    <template v-if="getSelectedFile(step)">
                      <div class="thinking-bar-file-preview-head">
                        <div class="thinking-bar-file-preview-title">
                          <span class="thinking-bar-tree-icon">
                            {{ getFileIcon(getSelectedFile(step)?.path || "") }}
                          </span>
                          <span>{{ getSelectedFile(step)?.path }}</span>
                        </div>
                        <span
                          v-if="isHtmlFile(getSelectedFile(step)?.path || '')"
                          class="thinking-bar-preview-chip"
                        >
                          HTML 预览
                        </span>
                      </div>
                      <div
                        v-if="isImageFile(getSelectedFile(step)?.path || '')"
                        class="thinking-bar-image-shell"
                      >
                        <img
                          v-if="getFileDataUrl(getSelectedFile(step))"
                          class="thinking-bar-image-preview"
                          :src="getFileDataUrl(getSelectedFile(step)) || ''"
                          :alt="getSelectedFile(step)?.name || '图片预览'"
                        />
                        <div v-else class="thinking-bar-empty-preview">
                          当前图片文件没有可直接渲染的内容。
                        </div>
                      </div>
                      <iframe
                        v-else-if="
                          isHtmlFile(getSelectedFile(step)?.path || '')
                        "
                        class="thinking-bar-html-preview"
                        :srcdoc="getFileContent(getSelectedFile(step))"
                        :title="getSelectedFile(step)?.path"
                        sandbox=""
                      />
                      <pre v-else class="thinking-bar-file-preview-body">{{
                        getFileContent(getSelectedFile(step))
                      }}</pre>
                    </template>
                    <div v-else class="thinking-bar-empty-preview">
                      还没选中文件，左边点一个看看。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { MdPreview } from "md-editor-v3";
import "md-editor-v3/lib/preview.css";
import SpotlightMarkdownPreview from "./SpotlightMarkdownPreview.vue";
import type { ToolTraceEvent } from "@inupedia/spotlight-protocol";
import {
  getIntentStepDisplayContent,
  humanizeSpotlightStepContent,
  isToolExecutionStep,
  sanitizeToolStepAnswerText,
  splitToolStepContent,
} from "../store/pipeline/displayText.js";
import { partitionToolCalls } from "../store/pipeline/toolDisplay.js";
import { TOOL_NAMES } from "../constants/toolNames.js";
import OfficialBorderBeam from "./OfficialBorderBeam.vue";

interface StepAttachment {
  id: string;
  type: "image" | "file" | "html";
  name?: string;
  url: string;
  mimeType?: string;
}

interface StepFile {
  id: string;
  path: string;
  name: string;
  content?: string[];
  createdAt?: string;
  modifiedAt?: string;
}

interface StepToolCall {
  id: string;
  name: string;
  displayName?: string;
  argsText?: string;
  resultText?: string;
  summary?: string;
  errorCode?: string;
  trace?: ToolTraceEvent[];
  status: "pending" | "running" | "done" | "error";
}

interface TableData {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

type StepChatItem =
  | {
      id: string;
      type: "text";
      text: string;
    }
  | {
      id: string;
      type: "tool";
      toolCall: StepToolCall;
    };

interface FileTreeNode {
  type: "directory" | "file";
  path: string;
  name: string;
  depth: number;
  file: StepFile | null;
}

const isOpen = ref(false);
const stepsContainerRef = ref<HTMLElement | null>(null);
/** 各阶段独立：仅当为 false 时跳过自动滚到底（用户在该阶段内上滑过） */
const stepStickToBottom = ref<Record<string, boolean>>({});
const stepBodyEls = new Map<string, HTMLElement>();
let scrollTimer: number | null = null;
let bodyResizeObserver: ResizeObserver | null = null;

function scheduleScrollAfterLayout(force: boolean) {
  void scrollToBottom(force);
  requestAnimationFrame(() => {
    void scrollToBottom(force);
  });
}

function setStepBodyRef(stepId: string, el: unknown) {
  const prev = stepBodyEls.get(stepId);
  if (prev && bodyResizeObserver) {
    bodyResizeObserver.unobserve(prev);
  }
  const html = el instanceof HTMLElement ? el : null;
  if (html) {
    stepBodyEls.set(stepId, html);
    bodyResizeObserver?.observe(html);
  } else {
    stepBodyEls.delete(stepId);
  }
}

function isStepBodyNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 96;
}

function handleStepBodyScroll(stepId: string, event: Event) {
  const el = event.target as HTMLElement;
  if (scrollTimer != null) {
    window.clearTimeout(scrollTimer);
  }
  stepStickToBottom.value = {
    ...stepStickToBottom.value,
    [stepId]: isStepBodyNearBottom(el),
  };
  scrollTimer = window.setTimeout(() => {
    stepStickToBottom.value = {
      ...stepStickToBottom.value,
      [stepId]: isStepBodyNearBottom(el),
    };
  }, 120);
}

function scrollTargetStepIds(): string[] {
  const active = props.steps.find((s) => s.status === "active");
  if (active) return [active.id];
  const last = props.steps[props.steps.length - 1];
  return last ? [last.id] : [];
}

function shouldFollowStepBody(stepId: string, force: boolean): boolean {
  if (force) return true;
  return stepStickToBottom.value[stepId] !== false;
}

onMounted(() => {
  if (typeof ResizeObserver !== "undefined") {
    bodyResizeObserver = new ResizeObserver(() => {
      void scrollToBottom();
    });
    void nextTick(() => {
      stepBodyEls.forEach((el) => {
        bodyResizeObserver?.observe(el);
      });
    });
  }
  requestAnimationFrame(() => {
    isOpen.value = true;
  });
  requestAnimationFrame(() => {
    scheduleScrollAfterLayout(true);
  });
});

onBeforeUnmount(() => {
  if (scrollTimer != null) {
    window.clearTimeout(scrollTimer);
  }
  bodyResizeObserver?.disconnect();
  bodyResizeObserver = null;
  stepBodyEls.clear();
});

const props = defineProps<{
  steps: Array<{
    id: string;
    label: string;
    status: "pending" | "active" | "done" | "error";
    content?: string;
    attachments?: StepAttachment[];
    files?: StepFile[];
    toolCalls?: StepToolCall[];
    chatItems?: StepChatItem[];
  }>;
  embedded?: boolean;
  centered?: boolean;
}>();

defineEmits<{
  close: [];
}>();

const titleText = computed(() => {
  const allEnded =
    props.steps.length > 0 &&
    props.steps.every((s) => s.status === "done" || s.status === "error");
  return allEnded ? "执行完成" : "思考中";
});

const isThinkingActive = computed(() =>
  props.steps.some(
    (step) =>
      step.status === "active" ||
      step.status === "pending" ||
      step.toolCalls?.some(
        (toolCall) =>
          toolCall.status === "pending" || toolCall.status === "running",
      ),
  ),
);
const activeStepCount = computed(
  () => props.steps.filter((step) => step.status === "active").length,
);
const doneStepCount = computed(
  () => props.steps.filter((step) => step.status === "done").length,
);

function stepIcon(status: string): string {
  switch (status) {
    case "active":
      return "⋯";
    case "done":
      return "✓";
    case "error":
      return "✕";
    default:
      return "·";
  }
}

function getToolId(toolCall: StepToolCall): string {
  return toolCall.name.trim().toLowerCase();
}

function getToolTitle(toolCall: StepToolCall): string {
  return toolCall.displayName?.trim() || toolCall.name;
}

type PipelineStep = (typeof props.steps)[number];

function getToolStepPlanning(step: PipelineStep): string {
  return splitToolStepContent(step.content ?? "").planning;
}

function getToolStepAnswer(step: PipelineStep): string {
  const { planning } = splitToolStepContent(step.content ?? "");
  const cleaned = stripInternalEvidenceAnswer(
    sanitizeToolStepAnswerText(step.content ?? ""),
  );
  if (cleaned.trim()) return cleaned;

  if (planning.trim()) return "";
  return stripInternalEvidenceAnswer(
    sanitizeToolStepAnswerText(step.content ?? ""),
  );
}

function stripInternalEvidenceAnswer(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("联网检索证据：") ||
    trimmed.includes("Tavily answer：")
  ) {
    return "";
  }
  return trimmed;
}

function collectRawToolCalls(step: PipelineStep): StepToolCall[] {
  if (step.toolCalls?.length) return step.toolCalls;
  return (step.chatItems ?? [])
    .filter(
      (item): item is Extract<StepChatItem, { type: "tool" }> =>
        item.type === "tool",
    )
    .map((item) => item.toolCall);
}

function getStepToolCalls(step: PipelineStep): StepToolCall[] {
  return partitionToolCalls(collectRawToolCalls(step)).visible;
}

function getNestedKnowledgeToolCalls(step: PipelineStep): StepToolCall[] {
  return partitionToolCalls(collectRawToolCalls(step)).nestedKnowledge;
}

function isKnowledgeAnswerTool(toolCall: StepToolCall): boolean {
  return normalizeToolName(toolCall.name) === TOOL_NAMES.knowledge.answer;
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function hasExecutionDetails(step: PipelineStep): boolean {
  return Boolean(
    getToolStepPlanning(step).trim() || getStepToolCalls(step).length > 0,
  );
}

function executionDetailsMeta(step: PipelineStep): string {
  const toolCount = getStepToolCalls(step).length;
  if (toolCount > 0) return `${toolCount} 个工具调用`;
  return "规划记录";
}

function toolStatusLabel(status: StepToolCall["status"]): string {
  switch (status) {
    case "done":
      return "已完成";
    case "error":
      return "失败";
    case "running":
      return "执行中";
    default:
      return "待执行";
  }
}

function formatToolTrace(trace?: ToolTraceEvent[]): string {
  if (!trace?.length) return "";
  return trace
    .map(
      (event) =>
        `[${event.phase}/${event.type}] ${event.tool}${event.detail ? ` · ${event.detail}` : ""}`,
    )
    .join("\n");
}

function isToolCallOpen(toolCall: StepToolCall): boolean {
  return toolCall.status === "running" || toolCall.status === "pending";
}

function parseStructuredText(value?: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getToolResultDisplay(toolCall: StepToolCall): string {
  const toolId = getToolId(toolCall);
  const raw = toolCall.resultText?.trim() || "";
  if (!raw) return "";

  if (toolId === "list_kbs") {
    const parsed = parseStructuredText(raw);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return "当前没有可访问的知识库";
      return raw;
    }
    return raw;
  }

  if (toolId === "list_directory" || toolId === "ls") {
    const parsed = parseStructuredText(raw);
    if (Array.isArray(parsed) && parsed.length === 0) {
      return "";
    }
    return raw;
  }

  return raw;
}

function getParsedToolResult(toolCall: StepToolCall): unknown {
  const raw = toolCall.resultText?.trim() || "";
  if (!raw) return null;
  return parseStructuredText(raw) ?? raw;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeInlineHtml(value: string): boolean {
  return /<(table|html|body|svg|div|span|img|p|iframe)[\s>]/i.test(value);
}

function getToolResultImage(toolCall: StepToolCall): string | null {
  const parsed = getParsedToolResult(toolCall);
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (/^data:image\//i.test(trimmed)) return trimmed;
    if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(trimmed)) return trimmed;
    return null;
  }

  if (isPlainObject(parsed)) {
    const candidate = [parsed.url, parsed.uri, parsed.path].find(
      (value) => typeof value === "string" && /^data:image\//i.test(value),
    );
    return typeof candidate === "string" ? candidate : null;
  }

  return null;
}

function getToolResultHtml(toolCall: StepToolCall): string | null {
  const parsed = getParsedToolResult(toolCall);
  if (typeof parsed === "string" && looksLikeInlineHtml(parsed.trim())) {
    return parsed;
  }
  if (isPlainObject(parsed)) {
    const candidate = [parsed.html, parsed.content, parsed.markup].find(
      (value) => typeof value === "string" && looksLikeInlineHtml(value),
    );
    return typeof candidate === "string" ? candidate : null;
  }
  return null;
}

function normalizeRows(value: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((item) => isPlainObject(item))) return null;
  return value as Array<Record<string, unknown>>;
}

function getToolResultTable(toolCall: StepToolCall): TableData | null {
  const parsed = getParsedToolResult(toolCall);
  if (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((item) => typeof item === "string")
  ) {
    return {
      columns: ["value"],
      rows: (parsed as string[]).map((value) => ({ value })),
    };
  }

  const directRows = normalizeRows(parsed);
  if (directRows) {
    const columns = [...new Set(directRows.flatMap((row) => Object.keys(row)))];
    return columns.length > 0 ? { columns, rows: directRows } : null;
  }

  if (!isPlainObject(parsed)) return null;

  if (
    Array.isArray(parsed.columns) &&
    Array.isArray(parsed.rows) &&
    parsed.columns.every((column) => typeof column === "string")
  ) {
    const columns = parsed.columns as string[];
    const rows = (parsed.rows as unknown[]).map((row) =>
      isPlainObject(row)
        ? row
        : Array.isArray(row)
          ? Object.fromEntries(
              columns.map((column, index) => [column, row[index]]),
            )
          : { value: row },
    );
    return columns.length > 0 ? { columns, rows } : null;
  }

  if (Array.isArray(parsed.data)) {
    const nestedRows = normalizeRows(parsed.data);
    if (nestedRows) {
      const columns = [
        ...new Set(nestedRows.flatMap((row) => Object.keys(row))),
      ];
      return columns.length > 0 ? { columns, rows: nestedRows } : null;
    }
  }

  return null;
}

function hasStructuredToolResult(toolCall: StepToolCall): boolean {
  const display = getToolResultDisplay(toolCall);
  const summary = toolCall.summary?.trim();
  if (display && summary && display.trim() === summary) return false;
  return Boolean(
    getToolResultImage(toolCall) ||
    getToolResultHtml(toolCall) ||
    getToolResultTable(toolCall) ||
    display,
  );
}

function formatTableCell(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function scrollToBottom(force = false) {
  await nextTick();
  const stepsContainer = stepsContainerRef.value;
  if (stepsContainer) {
    stepsContainer.scrollTo({
      top: stepsContainer.scrollHeight,
      behavior: force ? "auto" : "smooth",
    });
  }
  const ids = scrollTargetStepIds();
  for (const id of ids) {
    const el = stepBodyEls.get(id);
    if (!el || !shouldFollowStepBody(id, force)) continue;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: force ? "auto" : "smooth",
    });
  }

  window.setTimeout(() => {
    const retryContainer = stepsContainerRef.value;
    if (retryContainer) {
      retryContainer.scrollTo({
        top: retryContainer.scrollHeight,
        behavior: "auto",
      });
    }
    for (const id of ids) {
      const el = stepBodyEls.get(id);
      if (!el || !shouldFollowStepBody(id, force)) continue;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "auto",
      });
    }
  }, 120);
}

watch(
  () => props.steps,
  () => {
    if (isThinkingActive.value) {
      const active = props.steps.find((s) => s.status === "active");
      // When a new active step appears, default it to follow-bottom.
      // If user manually scrolls up, handleStepBodyScroll will flip it to false.
      if (active && !(active.id in stepStickToBottom.value)) {
        stepStickToBottom.value = {
          ...stepStickToBottom.value,
          [active.id]: true,
        };
      }
      scheduleScrollAfterLayout(false);
      return;
    }
    scheduleScrollAfterLayout(false);
  },
  { deep: true },
);

const selectedFileByStep = ref<Record<string, string>>({});
const expandedDirectoriesByStep = ref<Record<string, string[]>>({});

watch(
  () => props.steps,
  (steps) => {
    const next = { ...selectedFileByStep.value };
    const nextExpanded = { ...expandedDirectoriesByStep.value };
    for (const step of steps) {
      if (step.files?.length && !next[step.id]) {
        next[step.id] = step.files[0].id;
      }
      if (!step.files?.length && next[step.id]) {
        delete next[step.id];
      }
      if (step.files?.length) {
        const expanded = new Set(nextExpanded[step.id] || []);
        for (const file of step.files) {
          collectDirectoryPaths(file.path).forEach((path) =>
            expanded.add(path),
          );
        }
        nextExpanded[step.id] = [...expanded];
      }
      if (!step.files?.length && nextExpanded[step.id]) {
        delete nextExpanded[step.id];
      }
    }
    selectedFileByStep.value = next;
    expandedDirectoriesByStep.value = nextExpanded;
  },
  { deep: true, immediate: true },
);

function selectFile(stepId: string, fileId: string) {
  selectedFileByStep.value = {
    ...selectedFileByStep.value,
    [stepId]: fileId,
  };
}

function selectTreeFile(stepId: string, file: StepFile | null | undefined) {
  if (!file) return;
  selectFile(stepId, file.id);
}

function getSelectedFile(step: (typeof props.steps)[number]) {
  const selectedId = selectedFileByStep.value[step.id];
  return (
    step.files?.find((file) => file.id === selectedId) ??
    step.files?.[0] ??
    null
  );
}

function collectDirectoryPaths(path: string): string[] {
  const normalized = path.split("/").filter(Boolean);
  const directories: string[] = [];
  let current = "";
  normalized.slice(0, -1).forEach((segment) => {
    current += `/${segment}`;
    directories.push(current);
  });
  return directories;
}

function isDirectoryExpanded(stepId: string, path: string): boolean {
  return (expandedDirectoriesByStep.value[stepId] || []).includes(path);
}

function toggleDirectory(stepId: string, path: string) {
  const current = new Set(expandedDirectoriesByStep.value[stepId] || []);
  if (current.has(path)) current.delete(path);
  else current.add(path);
  expandedDirectoriesByStep.value = {
    ...expandedDirectoriesByStep.value,
    [stepId]: [...current],
  };
}

function getVisibleFileTree(stepId: string, files: StepFile[]): FileTreeNode[] {
  const directories = new Map<
    string,
    {
      path: string;
      name: string;
      depth: number;
      directoryChildren: string[];
      files: StepFile[];
    }
  >();

  const ensureDirectory = (path: string, name: string, depth: number) => {
    if (!directories.has(path)) {
      directories.set(path, {
        path,
        name,
        depth,
        directoryChildren: [],
        files: [],
      });
    }
    return directories.get(path)!;
  };

  const root = ensureDirectory("", "root", -1);

  for (const file of files) {
    const normalized = file.path.split("/").filter(Boolean);
    let currentPath = "";
    let parent = root;

    normalized.slice(0, -1).forEach((segment, index) => {
      currentPath += `/${segment}`;
      const directory = ensureDirectory(currentPath, segment, index);
      if (!parent.directoryChildren.includes(currentPath)) {
        parent.directoryChildren.push(currentPath);
      }
      parent = directory;
    });

    parent.files.push(file);
  }

  const nodes: FileTreeNode[] = [];
  const walk = (directoryPath: string) => {
    const current = directories.get(directoryPath);
    if (!current) return;

    const sortedDirectories = [...current.directoryChildren].sort((a, b) =>
      a.localeCompare(b, "zh-CN"),
    );
    for (const childPath of sortedDirectories) {
      const child = directories.get(childPath);
      if (!child) continue;
      nodes.push({
        type: "directory",
        path: child.path,
        name: child.name,
        depth: child.depth,
        file: null,
      });
      if (isDirectoryExpanded(stepId, child.path)) {
        walk(child.path);
      }
    }

    const sortedFiles = [...current.files].sort((a, b) =>
      a.path.localeCompare(b.path, "zh-CN"),
    );
    sortedFiles.forEach((file) => {
      const depth = Math.max(
        file.path.split("/").filter(Boolean).length - 1,
        0,
      );
      nodes.push({
        type: "file",
        path: file.path,
        name: file.name,
        depth,
        file,
      });
    });
  };

  walk("");
  return nodes;
}

function getFileContent(file: StepFile | null): string {
  return (file?.content || []).join("\n").trim();
}

function isImageFile(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(path);
}

function isHtmlFile(path: string): boolean {
  return /\.(html?)$/i.test(path);
}

function getFileDataUrl(file: StepFile | null): string {
  const content = getFileContent(file);
  if (/^data:image\//i.test(content)) {
    return content;
  }
  return "";
}

function getFileIcon(path: string): string {
  if (isImageFile(path)) return "🖼";
  if (isHtmlFile(path)) return "🌐";
  if (/\.md$/i.test(path)) return "📝";
  if (/\.(csv|xlsx?)$/i.test(path)) return "📊";
  if (/\.(json|ya?ml|xml)$/i.test(path)) return "🧩";
  return "📄";
}
</script>

<style scoped>
.thinking-bar {
  position: fixed;
  width: min(720px, calc(100vw - 48px));
  max-height: min(78vh, 820px);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-radius: 22px;
  box-shadow:
    0 24px 80px rgba(2, 6, 23, 0.48),
    0 0 0 1px rgba(148, 163, 184, 0.18);
  color: #e2e8f0;
  z-index: 10000;
  overflow: hidden;
  opacity: 0;
  backdrop-filter: blur(14px);
  transition:
    opacity 0.28s ease,
    transform 0.28s ease,
    inset 0.28s ease,
    width 0.28s ease,
    max-height 0.28s ease,
    border-radius 0.28s ease;
}

.thinking-bar--open {
  opacity: 1;
}

.thinking-bar--embedded {
  position: relative;
  right: auto;
  bottom: auto;
  width: 100%;
  max-height: 100%;
}

.thinking-bar--centered {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.96);
  transform-origin: center;
}

.thinking-bar--centered.thinking-bar--open {
  transform: translate(-50%, -50%) scale(1);
}

.thinking-bar--corner {
  right: 24px;
  bottom: 24px;
  width: min(440px, calc(100vw - 28px));
  max-height: min(76vh, calc(100vh - 36px));
  border-radius: 16px;
  transform: scale(0.96);
  transform-origin: right bottom;
}

.thinking-bar--corner.thinking-bar--open {
  transform: scale(1);
}

.thinking-bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  flex-shrink: 0;
}

.thinking-bar-title {
  font-size: 18px;
  font-weight: 700;
  color: #dbeafe;
  letter-spacing: 0.02em;
  min-width: 0;
  line-height: 1.35;
}

.thinking-bar-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.thinking-bar-close:hover {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.thinking-bar-steps {
  padding: 18px 22px 22px;
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.thinking-bar-step {
  --thinking-step-border-color: rgba(148, 163, 184, 0.1);
  --thinking-step-glow-color: rgba(148, 163, 184, 0.16);
  display: flex;
  flex-direction: column;
  position: relative;
  /* Let each step size to content; long tool details scroll internally. */
  flex: 0 0 auto;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
  font-size: 15px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.42);
  border: 1px solid var(--thinking-step-border-color);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 0 0 1px rgba(2, 6, 23, 0.16);
  overflow: hidden;
  isolation: isolate;
  transition:
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    background 0.22s ease;
}

.thinking-bar-step-inner {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 10px;
  min-width: 0;
}

.thinking-bar-step-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  z-index: 1;
}

.thinking-bar-step-body {
  flex: 1;
  min-height: 0;
  max-height: min(36vh, 340px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* 隐藏滚动条且不占用布局宽度（仍可滚轮/触控滑动） */
.thinking-bar-steps,
.thinking-bar-step-body,
.thinking-bar-tool-call-block,
.thinking-bar-tool-result-table-wrap,
.thinking-bar-file-tree-body,
.thinking-bar-file-preview-body {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.thinking-bar-steps::-webkit-scrollbar,
.thinking-bar-step-body::-webkit-scrollbar,
.thinking-bar-tool-call-block::-webkit-scrollbar,
.thinking-bar-tool-result-table-wrap::-webkit-scrollbar,
.thinking-bar-file-tree-body::-webkit-scrollbar,
.thinking-bar-file-preview-body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.thinking-bar-step-beam {
  z-index: 0;
}

.thinking-bar-step::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.04),
    rgba(255, 255, 255, 0.01)
  );
  pointer-events: none;
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
}

.thinking-bar-step.done {
  --thinking-step-border-color: rgba(59, 130, 246, 0.82);
  --thinking-step-glow-color: rgba(59, 130, 246, 0.24);
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0.58) 0%,
    rgba(10, 20, 38, 0.48) 100%
  );
  box-shadow:
    inset 0 0 0 1px rgba(96, 165, 250, 0.06),
    0 0 0 1px rgba(59, 130, 246, 0.12),
    0 10px 24px -20px var(--thinking-step-glow-color);
}

.thinking-bar-step.active {
  --thinking-step-border-color: rgba(255, 170, 64, 0.78);
  --thinking-step-glow-color: rgba(156, 64, 255, 0.2);
  background: linear-gradient(
    180deg,
    rgba(24, 18, 38, 0.82) 0%,
    rgba(17, 11, 32, 0.72) 100%
  );
  box-shadow:
    inset 0 0 0 1px rgba(255, 170, 64, 0.08),
    0 0 0 1px rgba(255, 170, 64, 0.14),
    0 12px 28px -20px var(--thinking-step-glow-color),
    0 0 24px -14px rgba(156, 64, 255, 0.22);
}

.thinking-bar-step.active::before {
  background: linear-gradient(
    180deg,
    rgba(255, 170, 64, 0.12),
    rgba(156, 64, 255, 0.04)
  );
}

.thinking-bar-step.error {
  --thinking-step-border-color: rgba(248, 113, 113, 0.72);
  --thinking-step-glow-color: rgba(248, 113, 113, 0.22);
  box-shadow:
    inset 0 0 0 1px rgba(248, 113, 113, 0.05),
    0 0 0 1px rgba(248, 113, 113, 0.12),
    0 10px 24px -20px var(--thinking-step-glow-color);
}

.thinking-bar-step-icon {
  flex-shrink: 0;
  align-self: flex-start;
  width: 22px;
  text-align: center;
  font-size: 15px;
  color: #64748b;
  position: relative;
  z-index: 1;
  margin-top: 2px;
}

.thinking-bar-step.active .thinking-bar-step-icon {
  color: #ffb347;
  text-shadow: 0 0 12px rgba(255, 170, 64, 0.35);
  animation: thinking-pulse 1.1s ease-in-out infinite;
}

.thinking-bar-step.done .thinking-bar-step-icon {
  color: #60a5fa;
}

.thinking-bar-step.error .thinking-bar-step-icon {
  color: #f87171;
}

.thinking-bar-step-label {
  flex-shrink: 0;
  color: #e2e8f0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  overflow: visible;
}

.thinking-bar-step-text {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.thinking-bar-step-markdown {
  white-space: normal;
}

.thinking-bar-md-preview {
  --md-theme-bg-color: transparent;
  --md-color: #94a3b8;
  --md-bk-color: transparent;
  --md-border-color: rgba(148, 163, 184, 0.14);
  --md-code-bg-color: rgba(15, 23, 42, 0.76);
  --md-code-color: #c4b5fd;
  --md-table-even-color: rgba(2, 6, 23, 0.52);
  --md-table-odd-color: rgba(2, 6, 23, 0.42);
  --md-table-header-bg-color: rgba(15, 23, 42, 0.96);
  --md-scrollbar-bg-color: rgba(148, 163, 184, 0.12);
  --md-scrollbar-thumb-color: rgba(148, 163, 184, 0.36);
}

.thinking-bar-step-markdown :deep(.md-editor-preview-wrapper) {
  padding: 0;
}

.thinking-bar-step-markdown :deep(.md-editor-preview) {
  color: #94a3b8;
  font-size: 14px;
  line-height: 1.6;
}

.thinking-bar-step-answer :deep(.md-editor-preview h1),
.thinking-bar-step-answer :deep(.md-editor-preview h2),
.thinking-bar-step-answer :deep(.md-editor-preview h3),
.thinking-bar-step-answer :deep(.md-editor-preview h4),
.thinking-bar-step-answer :deep(.md-editor-preview h5),
.thinking-bar-step-answer :deep(.md-editor-preview h6) {
  margin: 8px 0 4px;
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.55;
}

.thinking-bar-step-answer :deep(.md-editor-preview p),
.thinking-bar-step-answer :deep(.md-editor-preview ul),
.thinking-bar-step-answer :deep(.md-editor-preview ol),
.thinking-bar-step-answer :deep(.md-editor-preview li),
.thinking-bar-step-answer :deep(.md-editor-preview table),
.thinking-bar-step-answer :deep(.md-editor-preview th),
.thinking-bar-step-answer :deep(.md-editor-preview td) {
  font-size: 14px;
}

.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview h1),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview h2),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview h3),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview h4),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview h5),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview h6),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview p),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview ul),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview ol),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview li),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview table),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview th),
.thinking-bar--corner .thinking-bar-step-answer :deep(.md-editor-preview td) {
  font-size: 13px;
  line-height: 1.55;
}

.thinking-bar-step-markdown :deep(.md-editor-preview h1),
.thinking-bar-step-markdown :deep(.md-editor-preview h2),
.thinking-bar-step-markdown :deep(.md-editor-preview h3),
.thinking-bar-step-markdown :deep(.md-editor-preview h4),
.thinking-bar-step-markdown :deep(.md-editor-preview h5),
.thinking-bar-step-markdown :deep(.md-editor-preview h6) {
  margin: 8px 0 4px;
  color: #e2e8f0;
}

.thinking-bar-step-markdown :deep(.md-editor-preview p),
.thinking-bar-step-markdown :deep(.md-editor-preview ul),
.thinking-bar-step-markdown :deep(.md-editor-preview ol),
.thinking-bar-step-markdown :deep(.md-editor-preview hr),
.thinking-bar-step-markdown :deep(.md-editor-preview table) {
  margin: 4px 0;
}

.thinking-bar-step-markdown :deep(.md-editor-preview strong) {
  color: #f8fafc;
}

.thinking-bar-step-markdown :deep(.md-editor-preview code) {
  font-size: 12px;
}

.thinking-bar-step-markdown :deep(.md-editor-preview table) {
  display: block;
  overflow: auto;
  border-radius: 12px;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.thinking-bar-step-markdown :deep(.md-editor-preview table)::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.thinking-bar-step-markdown :deep(.md-editor-preview thead th) {
  position: sticky;
  top: 0;
  z-index: 1;
}

.thinking-bar-chat-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.thinking-bar-chat-item {
  min-width: 0;
}

.thinking-bar-tool-call {
  border: 1px solid rgba(114, 169, 176, 0.16);
  border-radius: 6px;
  background: rgba(2, 6, 23, 0.52);
  overflow: hidden;
}

.thinking-bar-tool-call-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
  list-style: none;
}

.thinking-bar-tool-call-head::-webkit-details-marker {
  display: none;
}

.thinking-bar-tool-call-head-main,
.thinking-bar-tool-call-head-side {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.thinking-bar-tool-call-head-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.thinking-bar-tool-call-head-side {
  flex-shrink: 0;
}

.thinking-bar-tool-call-caret {
  color: #94a3b8;
  font-size: 12px;
  transition: transform 0.18s ease;
}

.thinking-bar-tool-call[open] .thinking-bar-tool-call-caret {
  transform: rotate(180deg);
}

.thinking-bar-tool-call-body {
  padding: 12px;
  display: grid;
  gap: var(--thinking-detail-gap);
  min-width: 0;
  max-height: min(42vh, 420px);
  overflow-y: auto;
  border-top: 1px solid rgba(114, 169, 176, 0.12);
}

.thinking-bar-tool-call-name {
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.thinking-bar-tool-call-status {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
  font-size: 11px;
  font-weight: 600;
}

.thinking-bar-tool-call-status.is-running {
  background: rgba(56, 189, 248, 0.16);
  color: #7dd3fc;
}

.thinking-bar-tool-call-status.is-done {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}

.thinking-bar-tool-call-status.is-error {
  background: rgba(248, 113, 113, 0.16);
  color: #fca5a5;
}

.thinking-bar-tool-call-block {
  margin: 0;
  border-radius: 6px;
  border: 1px solid rgba(114, 169, 176, 0.1);
  background: rgba(15, 23, 42, 0.78);
  padding: 12px;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.6;
  max-height: min(30vh, 300px);
}

.thinking-bar-tool-call-block + .thinking-bar-tool-call-block {
  margin-top: 0;
}

.thinking-bar-tool-call-block-title {
  margin: 0;
  color: #7dd3fc;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.thinking-bar-tool-call-pre {
  margin: 0;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.thinking-bar-tool-trace-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thinking-bar-tool-trace-item {
  color: #cbd5e1;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.thinking-bar-tool-result-image-shell {
  padding: 8px;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.6);
}

.thinking-bar-tool-result-image {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: contain;
  border-radius: 10px;
}

.thinking-bar-tool-result-html {
  width: 100%;
  min-height: min(200px, 22vh);
  border: none;
  border-radius: 10px;
  background: #fff;
}

.thinking-bar-tool-result-table-wrap {
  overflow: auto;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.thinking-bar-tool-result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 1.5;
}

.thinking-bar-tool-result-table th,
.thinking-bar-tool-result-table td {
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  white-space: pre-wrap;
  word-break: break-word;
}

.thinking-bar-tool-result-table th {
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.96);
  color: #e2e8f0;
  font-weight: 700;
}

.thinking-bar-tool-result-table td {
  color: #cbd5e1;
  background: rgba(2, 6, 23, 0.48);
}

.thinking-bar-attachments {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

.thinking-bar-attachment {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.2);
  background: rgba(15, 23, 42, 0.68);
  color: inherit;
  text-decoration: none;
}

.thinking-bar-attachment:hover {
  border-color: rgba(56, 189, 248, 0.42);
}

.thinking-bar-attachment-image {
  width: 100%;
  max-height: 240px;
  object-fit: contain;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.72);
}

.thinking-bar-attachment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.thinking-bar-attachment-name {
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  word-break: break-word;
}

.thinking-bar-attachment-type {
  color: #38bdf8;
  font-size: 12px;
  flex-shrink: 0;
}

.thinking-bar-workspace {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.thinking-bar-workspace-title {
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 700;
}

.thinking-bar-workspace-shell {
  display: grid;
  grid-template-columns: minmax(210px, 240px) minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
}

.thinking-bar-file-tree-pane {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.46);
  overflow: hidden;
}

.thinking-bar-file-tree-head {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 700;
}

.thinking-bar-file-tree-body {
  max-height: min(200px, 100%);
  overflow: auto;
  padding: 8px 0;
}

.thinking-bar-tree-node {
  display: block;
}

.thinking-bar-tree-row {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: #cbd5e1;
  text-align: left;
  cursor: pointer;
}

.thinking-bar-tree-row:hover {
  background: rgba(30, 41, 59, 0.72);
}

.thinking-bar-tree-row--file.active {
  background: rgba(14, 116, 144, 0.22);
  color: #e0f2fe;
}

.thinking-bar-tree-row--directory {
  color: #dbeafe;
}

.thinking-bar-tree-caret {
  width: 12px;
  color: #94a3b8;
  font-size: 11px;
  flex-shrink: 0;
}

.thinking-bar-tree-icon {
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.thinking-bar-tree-label {
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.thinking-bar-file-preview {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.58);
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.thinking-bar-file-preview-head {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 600;
  word-break: break-word;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.thinking-bar-file-preview-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.thinking-bar-preview-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.16);
  color: #7dd3fc;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.thinking-bar-file-preview-body {
  margin: 0;
  padding: 12px;
  flex: 1;
  overflow: auto;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.thinking-bar-image-shell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(2, 6, 23, 0.72);
}

.thinking-bar-image-preview {
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
  border-radius: 12px;
}

.thinking-bar-html-preview {
  flex: 1;
  min-height: min(200px, 28vh);
  border: none;
  background: #fff;
}

.thinking-bar-empty-preview {
  padding: 18px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.7;
}

.thinking-bar-step.pending .thinking-bar-step-label {
  color: #64748b;
}

.thinking-bar--corner .thinking-bar-header {
  padding: 14px 16px 12px;
}

.thinking-bar--corner .thinking-bar-title {
  font-size: 16px;
}

.thinking-bar--corner .thinking-bar-steps {
  padding: 12px 14px 14px;
  flex: 1;
  min-height: 0;
  gap: 8px;
}

.thinking-bar--corner .thinking-bar-step {
  padding: 10px 12px;
}

.thinking-bar--corner .thinking-bar-step-inner {
  gap: 8px;
}

.thinking-bar--corner .thinking-bar-step-icon {
  width: 18px;
  font-size: 14px;
}

.thinking-bar--corner .thinking-bar-step-label {
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
}

.thinking-bar--corner .thinking-bar-step-text,
.thinking-bar--corner .thinking-bar-step-markdown :deep(.md-editor-preview) {
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.thinking-bar--corner .thinking-bar-tool-call-body {
  max-height: min(38vh, 300px);
  overflow-y: auto;
}

.thinking-bar--corner .thinking-bar-tool-call-block {
  max-height: min(24vh, 180px);
  overflow: auto;
}

.thinking-bar {
  width: min(980px, calc(100vw - 56px));
  border-radius: 8px;
  border: 1px solid rgba(96, 142, 154, 0.3);
  background:
    radial-gradient(
      circle at 18% 0%,
      rgba(45, 111, 132, 0.16),
      transparent 30%
    ),
    linear-gradient(135deg, rgba(8, 30, 45, 0.96), rgba(3, 15, 28, 0.94));
  box-shadow:
    0 30px 90px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.035);
  isolation: isolate;
}

.thinking-bar-grid {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    repeating-linear-gradient(
      175deg,
      transparent 0,
      transparent 34px,
      rgba(96, 165, 168, 0.04) 35px,
      transparent 38px
    ),
    linear-gradient(rgba(125, 157, 169, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125, 157, 169, 0.03) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: linear-gradient(180deg, black 0, transparent 82%);
}

.thinking-bar-header,
.thinking-bar-steps {
  position: relative;
  z-index: 1;
}

.thinking-bar-header {
  padding: 18px 20px;
  border-bottom-color: rgba(96, 142, 154, 0.24);
  background: linear-gradient(
    90deg,
    rgba(13, 48, 64, 0.42),
    rgba(4, 18, 31, 0)
  );
}

.thinking-bar-title-stack {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.thinking-bar-kicker {
  color: #9bb8c2;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.thinking-bar-title {
  color: #edf7f8;
  font-size: 20px;
  letter-spacing: 0;
}

.thinking-bar-metrics {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.thinking-bar-metric {
  display: grid;
  min-width: 58px;
  padding: 7px 9px;
  border: 1px solid rgba(114, 169, 176, 0.2);
  border-radius: 4px;
  background: rgba(5, 22, 36, 0.64);
  text-align: center;
}

.thinking-bar-metric strong {
  color: #e8f3f4;
  font-size: 15px;
  line-height: 1.1;
}

.thinking-bar-metric em {
  color: rgba(190, 214, 218, 0.62);
  font-size: 10px;
  font-style: normal;
  line-height: 1.2;
}

.thinking-bar-close {
  flex-shrink: 0;
  margin-left: 8px;
  border-radius: 4px;
  border: 1px solid rgba(114, 169, 176, 0.18);
  background: rgba(15, 23, 42, 0.52);
}

.thinking-bar-close:hover {
  background: rgba(74, 124, 142, 0.18);
  color: #edf7f8;
}

.thinking-bar-steps {
  gap: 12px;
  padding: 18px 20px 20px;
}

.thinking-bar-steps::before {
  content: "";
  position: sticky;
  top: 0;
  display: block;
  height: 1px;
  margin: -2px 0 2px;
  background: linear-gradient(
    90deg,
    rgba(112, 172, 150, 0),
    rgba(112, 172, 150, 0.32),
    rgba(201, 162, 93, 0.22),
    rgba(112, 172, 150, 0)
  );
  z-index: 2;
}

.thinking-bar-step {
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(13, 48, 64, 0.24), rgba(4, 18, 31, 0.56)),
    rgba(2, 6, 23, 0.58);
  border-color: rgba(114, 169, 176, 0.14);
}

.thinking-bar-step::before {
  background:
    linear-gradient(180deg, rgba(160, 190, 196, 0.045), transparent),
    repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent 18px,
      rgba(112, 172, 150, 0.035) 19px,
      transparent 22px
    );
}

.thinking-bar-step::after {
  content: "";
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 999px 999px 0;
  background: rgba(100, 116, 139, 0.55);
}

.thinking-bar-step.active::after {
  background: #c9a25d;
  box-shadow: none;
}

.thinking-bar-step.done::after {
  background: #70ac96;
  box-shadow: none;
}

.thinking-bar-step.error::after {
  background: #d08b8b;
  box-shadow: none;
}

.thinking-bar-step.active {
  --thinking-step-border-color: rgba(201, 162, 93, 0.38);
  --thinking-step-glow-color: transparent;
  border-color: rgba(201, 162, 93, 0.34);
  background:
    linear-gradient(90deg, rgba(92, 73, 39, 0.24), rgba(13, 48, 64, 0.18)),
    rgba(2, 6, 23, 0.62);
  box-shadow:
    inset 0 0 0 1px rgba(201, 162, 93, 0.06),
    0 0 0 1px rgba(201, 162, 93, 0.08);
}

.thinking-bar-step.done {
  --thinking-step-border-color: rgba(112, 172, 150, 0.34);
  --thinking-step-glow-color: transparent;
  border-color: rgba(112, 172, 150, 0.28);
  background:
    linear-gradient(90deg, rgba(29, 71, 61, 0.2), rgba(13, 48, 64, 0.18)),
    rgba(2, 6, 23, 0.58);
  box-shadow:
    inset 0 0 0 1px rgba(112, 172, 150, 0.05),
    0 0 0 1px rgba(112, 172, 150, 0.08);
}

.thinking-bar-step.error {
  --thinking-step-border-color: rgba(208, 139, 139, 0.34);
  --thinking-step-glow-color: transparent;
  border-color: rgba(208, 139, 139, 0.3);
  box-shadow:
    inset 0 0 0 1px rgba(208, 139, 139, 0.05),
    0 0 0 1px rgba(208, 139, 139, 0.08);
}

.thinking-bar-step.active::before {
  background: linear-gradient(180deg, rgba(201, 162, 93, 0.08), transparent);
}

.thinking-bar-step-label,
.thinking-bar-tool-call-name,
.thinking-bar-workspace-title {
  color: #edf7f8;
}

.thinking-bar-step-body {
  max-height: min(46vh, 430px);
}

.thinking-bar-tool-call,
.thinking-bar-attachment,
.thinking-bar-file-tree-pane,
.thinking-bar-file-preview {
  border-radius: 6px;
  border-color: rgba(114, 169, 176, 0.16);
  background: rgba(4, 18, 31, 0.66);
}

.thinking-bar-tool-call-head,
.thinking-bar-file-tree-head,
.thinking-bar-file-preview-head {
  background: rgba(13, 48, 64, 0.24);
}

.thinking-bar-tool-call-status {
  border-radius: 4px;
  border: 1px solid rgba(114, 169, 176, 0.14);
}

.thinking-bar-tool-call-block,
.thinking-bar-file-preview-body {
  border: 1px solid rgba(114, 169, 176, 0.1);
  background: rgba(2, 13, 24, 0.72);
}

.thinking-bar-tool-result-table th {
  background: rgba(13, 48, 64, 0.96);
}

.thinking-bar-step.active .thinking-bar-step-icon {
  color: #c9a25d;
  text-shadow: none;
  animation: none;
}

.thinking-bar-step.done .thinking-bar-step-icon {
  color: #70ac96;
}

.thinking-bar-step.error .thinking-bar-step-icon {
  color: #d08b8b;
}

.thinking-bar-tool-call-status.is-running {
  background: rgba(201, 162, 93, 0.14);
  color: #c9a25d;
}

.thinking-bar-tool-call-status.is-done {
  background: rgba(112, 172, 150, 0.14);
  color: #8fc6b2;
}

.thinking-bar-tool-call-status.is-error {
  background: rgba(208, 139, 139, 0.14);
  color: #d08b8b;
}

.thinking-bar-attachment-type,
.thinking-bar-preview-chip,
.thinking-bar-tool-call-block-title {
  color: #b9ccd1;
}

.thinking-bar-preview-chip {
  background: rgba(74, 124, 142, 0.18);
}

.thinking-bar--corner {
  width: min(520px, calc(100vw - 28px));
}

.thinking-bar--corner .thinking-bar-metrics {
  display: none;
}

@media (max-width: 768px) {
  .thinking-bar--centered {
    width: calc(100vw - 24px);
    max-height: 72vh;
  }

  .thinking-bar--corner {
    right: 12px;
    bottom: 12px;
    width: min(360px, calc(100vw - 24px));
    max-height: min(72vh, calc(100vh - 24px));
  }

  .thinking-bar-header {
    padding: 16px 16px 14px;
  }

  .thinking-bar-steps {
    padding: 14px 16px 16px;
  }

  .thinking-bar-workspace-shell {
    grid-template-columns: 1fr;
  }

  .thinking-bar-header {
    align-items: flex-start;
    gap: 10px;
  }

  .thinking-bar-metrics {
    display: none;
  }
}

.thinking-bar-step-answer {
  margin: 0;
}

.thinking-bar-tool-step-flow {
  --thinking-detail-gap: 12px;
  display: flex;
  flex-direction: column;
  gap: var(--thinking-detail-gap);
}

.thinking-bar-step-answer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.thinking-bar-step-section-label {
  color: #dbeafe;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.thinking-bar-execution-details {
  margin: 0;
  border: 1px solid rgba(114, 169, 176, 0.18);
  border-radius: 6px;
  background: rgba(4, 18, 31, 0.52);
  overflow: hidden;
}

.thinking-bar-execution-details-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  background: rgba(13, 48, 64, 0.28);
}

.thinking-bar-execution-details-summary::-webkit-details-marker {
  display: none;
}

.thinking-bar-execution-details-title {
  color: #dbeafe;
  font-size: 13px;
  font-weight: 700;
}

.thinking-bar-execution-details-meta {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(114, 169, 176, 0.16);
  background: rgba(2, 13, 24, 0.72);
  color: #9bb8c2;
  font-size: 11px;
  font-weight: 600;
}

.thinking-bar-execution-details-caret {
  color: #94a3b8;
  font-size: 12px;
  transition: transform 0.18s ease;
}

.thinking-bar-execution-details[open] .thinking-bar-execution-details-caret {
  transform: rotate(180deg);
}

.thinking-bar-execution-details-body {
  display: grid;
  gap: var(--thinking-detail-gap, 12px);
  padding: 12px;
  border-top: 1px solid rgba(114, 169, 176, 0.12);
}

.thinking-bar-execution-planning {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid rgba(114, 169, 176, 0.1);
  background: rgba(2, 13, 24, 0.72);
  color: #b9ccd1;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.thinking-bar-tool-call-id {
  display: block;
  margin-top: 6px;
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.thinking-bar-tool-call-block--error {
  border-color: rgba(208, 139, 139, 0.24);
}

.thinking-bar-tool-call-block--error .thinking-bar-tool-call-block-title {
  color: #d08b8b;
}

.thinking-bar-nested-tools {
  display: grid;
  gap: var(--thinking-detail-gap, 12px);
  padding-top: 4px;
}

.thinking-bar-nested-tools-label {
  color: #9bb8c2;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.thinking-bar-tool-call--nested {
  border-style: dashed;
  background: rgba(2, 13, 24, 0.42);
}

@keyframes thinking-pulse {
  50% {
    opacity: 0.6;
  }
}
</style>
