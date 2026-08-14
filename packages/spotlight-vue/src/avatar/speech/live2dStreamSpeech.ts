/** 与 Spotlight 流水线「回答」步骤 id 一致 */
export const LIVE2D_ANSWER_STEP_ID = "answer";

const SENTENCE_END_RE = /[。！？；\n]/;
const DEFAULT_MIN_CHARS = 6;

export function normalizeLive2dSpeechSegment(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[#>*_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Live2dAnswerSegmenter = {
  reset: () => void;
  /** 根据当前步骤全文增量切出可播报的完整句 */
  push: (fullText: string) => string[];
  /** 流水线结束时吐出缓冲区剩余内容 */
  flush: (fullText?: string) => string[];
};

export function createLive2dAnswerSegmenter(options?: {
  minChars?: number;
}): Live2dAnswerSegmenter {
  const minChars = options?.minChars ?? DEFAULT_MIN_CHARS;
  let processedLength = 0;
  let pending = "";

  function takeCompleteSegments(): string[] {
    const out: string[] = [];
    while (true) {
      const idx = pending.search(SENTENCE_END_RE);
      if (idx < 0) break;
      const piece = pending.slice(0, idx + 1);
      pending = pending.slice(idx + 1);
      const seg = normalizeLive2dSpeechSegment(piece);
      if (seg.length >= minChars) out.push(seg);
    }
    return out;
  }

  return {
    reset() {
      processedLength = 0;
      pending = "";
    },
    push(fullText: string) {
      const delta = fullText.slice(processedLength);
      if (!delta) return [];
      processedLength = fullText.length;
      pending += delta;
      return takeCompleteSegments();
    },
    flush(fullText?: string) {
      if (fullText != null) {
        const delta = fullText.slice(processedLength);
        if (delta) {
          pending += delta;
          processedLength = fullText.length;
        }
      }
      const out = takeCompleteSegments();
      const tail = normalizeLive2dSpeechSegment(pending);
      pending = "";
      if (tail.length >= minChars) out.push(tail);
      return out;
    },
  };
}
