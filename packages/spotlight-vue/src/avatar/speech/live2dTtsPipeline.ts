import {
  buildWavEnvelopeFromBlob,
  type WavEnvelope,
} from "../spine/spineLipSync.js";

/**
 * 数字人流式 TTS 管线：
 * - 合成：并行（每切出一句立即请求 TTS，互不等待）
 * - 播放：严格串行（上一段 audio 自然播完才播下一段）
 */

export type Live2dTtsPlayContext = {
  /** 队列中是否还有下一句（有则段末不硬切嘴型/气泡） */
  hasFollowingClip: boolean;
  lipSyncEnvelope?: WavEnvelope;
};

export type Live2dTtsClip = {
  text: string;
  blob: Blob | null;
  error: unknown;
  ready: Promise<void>;
  lipSyncEnvelope: WavEnvelope | null;
};

export type Live2dTtsPipelineHandlers = {
  synthesize: (text: string, signal?: AbortSignal) => Promise<Blob>;
  playBlob: (
    text: string,
    blob: Blob,
    context: Live2dTtsPlayContext,
  ) => Promise<void>;
  onError: (message: string) => void;
  onSessionEnd: () => void;
  isSessionActive: () => boolean;
};

export type Live2dTtsPipeline = {
  reset: () => void;
  begin: () => void;
  /** 新句子：立刻并行合成，播放器按入队顺序串行播出 */
  enqueue: (segments: string[], signal: AbortSignal) => void;
  closeFeed: () => void;
};

export function createLive2dTtsPipeline(
  handlers: Live2dTtsPipelineHandlers,
): Live2dTtsPipeline {
  const clips: Live2dTtsClip[] = [];
  let playIndex = 0;
  let feedClosed = true;
  let playerRunning = false;

  function reset(): void {
    clips.length = 0;
    playIndex = 0;
    feedClosed = true;
    playerRunning = false;
  }

  function begin(): void {
    reset();
    feedClosed = false;
  }

  function enqueue(segments: string[], signal: AbortSignal): void {
    if (!segments.length) return;

    for (const text of segments) {
      let resolveReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      const clip: Live2dTtsClip = {
        text,
        blob: null,
        error: null,
        ready,
        lipSyncEnvelope: null,
      };
      clips.push(clip);

      void handlers
        .synthesize(text, signal)
        .then((blob) => {
          if (!handlers.isSessionActive()) return;
          clip.blob = blob;
          void buildWavEnvelopeFromBlob(blob)
            .then((envelope) => {
              if (!handlers.isSessionActive()) return;
              clip.lipSyncEnvelope = envelope;
            })
            .catch(() => {
              /* 播放时再按 URL 解析 */
            });
        })
        .catch((err) => {
          clip.error = err;
        })
        .finally(() => resolveReady());
    }

    void runPlayer();
  }

  function closeFeed(): void {
    feedClosed = true;
    void runPlayer();
  }

  async function runPlayer(): Promise<void> {
    if (playerRunning) return;
    playerRunning = true;

    try {
      while (handlers.isSessionActive()) {
        if (playIndex >= clips.length) {
          if (feedClosed) break;
          await sleep(32);
          continue;
        }

        const clip = clips[playIndex]!;
        await clip.ready;
        if (!handlers.isSessionActive()) return;
        if (clip.error) {
          throw clip.error;
        }
        if (!clip.blob) {
          playIndex += 1;
          continue;
        }

        const hasFollowingClip =
          playIndex + 1 < clips.length ||
          (!feedClosed && handlers.isSessionActive());

        await handlers.playBlob(clip.text, clip.blob, {
          hasFollowingClip,
          lipSyncEnvelope: clip.lipSyncEnvelope ?? undefined,
        });
        playIndex += 1;
      }

      if (handlers.isSessionActive() && feedClosed) {
        handlers.onSessionEnd();
      }
    } catch (err) {
      if (!handlers.isSessionActive()) return;
      const message =
        err instanceof Error ? err.message : "数字人语音播放失败，请稍后重试。";
      handlers.onError(message);
    } finally {
      playerRunning = false;
      if (handlers.isSessionActive() && playIndex < clips.length) {
        void runPlayer();
      }
    }
  }

  return { reset, begin, enqueue, closeFeed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
