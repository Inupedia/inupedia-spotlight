<template>
  <div
    class="thinking-bar"
    :class="[
      { 'thinking-bar--embedded': embedded },
      { 'thinking-bar--open': isOpen },
      { 'thinking-bar--centered': centered },
      { 'thinking-bar--corner': !centered && !embedded },
      { 'thinking-bar--memory-result': isMemoryReuseResult },
    ]"
  >
    <div class="thinking-bar-grid" aria-hidden="true" />
    <div class="thinking-bar-header">
      <div class="thinking-bar-title-stack">
        <span class="thinking-bar-kicker">Spotlight</span>
        <span class="thinking-bar-title">{{ titleText }}</span>
        <span
          v-if="memoryBadge && !isMemoryReuseResult"
          class="thinking-bar-memory-badge"
          >{{ memoryBadge }}</span
        >
        <button
          v-if="memoryDecision?.canForceRefresh && !isMemoryReuseResult"
          type="button"
          class="thinking-bar-memory-refresh"
          @click="$emit('force-refresh')"
        >
          重新查询
        </button>
      </div>
      <div
        v-if="!isMemoryReuseResult"
        class="thinking-bar-metrics"
        aria-label="执行状态概览"
      >
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
    <main
      v-if="isMemoryReuseResult"
      class="thinking-bar-memory-result"
      aria-label="项目记忆回答"
    >
      <div class="thinking-bar-memory-result-intro">
        <span class="thinking-bar-memory-result-icon" aria-hidden="true"
          >✓</span
        >
        <div class="thinking-bar-memory-result-copy">
          <span class="thinking-bar-memory-result-eyebrow">来自项目记忆</span>
          <strong>{{ memoryResultHeading }}</strong>
          <p>{{ memoryResultDescription }}</p>
        </div>
      </div>

      <section class="thinking-bar-memory-result-answer">
        <div class="thinking-bar-memory-result-answer-label">回答</div>
        <div
          class="thinking-bar-step-text thinking-bar-step-markdown thinking-bar-step-answer"
        >
          <SpotlightMarkdownPreview
            :model-value="memoryResultAnswer"
            format-knowledge
          />
        </div>
      </section>

      <footer class="thinking-bar-memory-result-footer">
        <span>本次直接复用已验证答案，未重新查询数据源。</span>
        <button
          v-if="memoryDecision?.canForceRefresh"
          type="button"
          class="thinking-bar-memory-refresh thinking-bar-memory-result-refresh"
          @click="$emit('force-refresh')"
        >
          重新查询最新资料
        </button>
      </footer>
    </main>
    <div v-else ref="stepsContainerRef" class="thinking-bar-steps">
      <div
        v-for="step in steps"
        :key="step.id"
        class="thinking-bar-step"
        :class="[step.status]"
      >
        <div class="thinking-bar-step-inner">
          <span
            class="thinking-bar-step-status"
            :class="`is-${step.status}`"
            aria-hidden="true"
          />
          <div class="thinking-bar-step-column">
            <span class="thinking-bar-step-label">{{ step.label }}</span>
            <div
              :ref="(el) => setStepBodyRef(step.id, el)"
              class="thinking-bar-step-body"
              @scroll.passive="handleStepBodyScroll(step.id, $event)"
            >
              <template v-if="isToolExecutionStep(step.id)">
                <div class="thinking-bar-tool-step-flow">
                  <div
                    v-if="getGatherProcess(step)"
                    class="thinking-bar-gather-process"
                  >
                    <p
                      v-if="getGatherProcess(step)?.headline"
                      class="thinking-bar-gather-headline"
                    >
                      {{ getGatherProcess(step)?.headline }}
                    </p>
                    <ol
                      v-if="getGatherProcess(step)?.items.length"
                      class="thinking-bar-source-list"
                    >
                      <li
                        v-for="(item, index) in getGatherProcess(step)?.items"
                        :key="`${step.id}-source-${index}`"
                      >
                        {{ item }}
                      </li>
                    </ol>
                    <p
                      v-if="getGatherProcess(step)?.note"
                      class="thinking-bar-gather-note"
                    >
                      {{ getGatherProcess(step)?.note }}
                    </p>
                  </div>
                  <details
                    v-if="hasExecutionDetails(step)"
                    class="thinking-bar-execution-details"
                  >
                    <summary class="thinking-bar-execution-details-summary">
                      <span class="thinking-bar-execution-details-title">{{
                        step.label === "操作页面" ? "页面操作" : "本次检索"
                      }}</span>
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
                        >{{ getToolStepPlanning(step) }}</pre>
                      <details
                        v-for="toolCall in getStepToolCalls(step)"
                        :key="toolCall.id"
                        class="thinking-bar-tool-call"
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
                              formatGatherProcessText(toolCall.summary)
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
                              >{{ getToolResultDisplay(toolCall) }}</pre>
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
                </div>
              </template>
              <template v-else-if="isAnswerStep(step.id)">
                <div
                  v-if="step.content"
                  class="thinking-bar-step-text thinking-bar-step-markdown thinking-bar-step-answer"
                >
                  <SpotlightMarkdownPreview
                    :model-value="stripInternalEvidenceAnswer(step.content)"
                    format-knowledge
                  />
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
                            >{{ getToolResultDisplay(item.toolCall) }}</pre>
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
  isAnswerStep,
  isToolExecutionStep,
  parseGatherProcessDisplay,
  formatGatherProcessText,
  sanitizeToolStepAnswerText,
  splitToolStepContent,
} from "../store/pipeline/displayText.js";
import {
  isUserFacingKnowledgeTool,
  partitionToolCalls,
} from "../store/pipeline/toolDisplay.js";
import { getSpotlightMemoryResultCopy } from "../store/memoryResultCopy.js";
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
  memoryReplay?: {
    source: "exact" | "semantic" | "session";
    entryId: string;
    kind: string;
  } | null;
  memoryDecision?:
    import("@inupedia/spotlight-protocol").SpotlightMemoryDecision | null;
}>();

defineEmits<{
  close: [];
  "force-refresh": [];
}>();

const titleText = computed(() => {
  if (isMemoryReuseResult.value) return "项目记忆已回答";
  const allEnded =
    props.steps.length > 0 &&
    props.steps.every((s) => s.status === "done" || s.status === "error");
  return allEnded ? "执行完成" : "思考中";
});

const memoryBadge = computed(() => {
  if (props.memoryDecision) {
    const labels = {
      reuse: "已复用项目记忆",
      augment: "已结合项目记忆",
      refresh: "已重新验证资料",
      ignore: "",
    } as const;
    return labels[props.memoryDecision.action];
  }
  if (!props.memoryReplay) return "";
  if (props.memoryReplay.source === "semantic") return "语义缓存";
  if (props.memoryReplay.source === "exact") return "Memory 缓存";
  return "Session 缓存";
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

const isMemoryReuseResult = computed(
  () =>
    props.memoryDecision?.action === "reuse" &&
    props.steps.length > 0 &&
    props.steps.every(
      (step) => step.status === "done" || step.status === "error",
    ),
);

const memoryResultAnswer = computed(() => {
  const answerStep =
    props.steps.find((step) => isAnswerStep(step.id)) ??
    props.steps.find((step) => isToolExecutionStep(step.id));
  if (!answerStep) return "项目记忆中没有可展示的回答。";
  return (
    (isAnswerStep(answerStep.id)
      ? answerStep.content?.trim()
      : getToolStepAnswer(answerStep).trim()) ||
    answerStep.content?.trim() ||
    "项目记忆中没有可展示的回答。"
  );
});

const memoryResultCopy = computed(() =>
  getSpotlightMemoryResultCopy(props.memoryReplay?.source),
);
const memoryResultHeading = computed(() => memoryResultCopy.value.heading);
const memoryResultDescription = computed(
  () => memoryResultCopy.value.description,
);
const activeStepCount = computed(
  () => props.steps.filter((step) => step.status === "active").length,
);
const doneStepCount = computed(
  () => props.steps.filter((step) => step.status === "done").length,
);

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

function getGatherProcess(step: PipelineStep) {
  const { planning, answer } = splitToolStepContent(step.content ?? "");
  const text = stripInternalEvidenceAnswer((planning || answer).trim());
  if (!text) return null;
  return parseGatherProcessDisplay(text);
}

function getToolStepAnswer(step: PipelineStep): string {
  if (!isAnswerStep(step.id) && isToolExecutionStep(step.id)) return "";
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
    trimmed.includes("Tavily answer：") ||
    trimmed.includes("Hikari answer") ||
    trimmed.includes("Yuxi project knowledge") ||
    trimmed.includes("Spotlight knowledge")
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
  return isUserFacingKnowledgeTool(toolCall.name);
}

function hasExecutionDetails(step: PipelineStep): boolean {
  return Boolean(
    getToolStepPlanning(step).trim() || getStepToolCalls(step).length > 0,
  );
}

function executionDetailsMeta(step: PipelineStep): string {
  const calls = getStepToolCalls(step);
  if (calls.length === 0) return "规划记录";
  const busy = calls.some(
    (toolCall) => toolCall.status === "running" || toolCall.status === "pending",
  );
  return busy
    ? `${calls.length} 个工具 · 执行中`
    : `${calls.length} 个工具调用`;
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
@import "../styles/spotlight-thinking.css";
</style>
