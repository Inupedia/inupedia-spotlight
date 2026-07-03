/** 等音频自然播完，避免 `ended` 过早触发导致段尾被截断 */
export function waitForAudioNaturalEnd(
  audio: HTMLAudioElement,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onEnded = () => finish();
    const onTimeUpdate = () => {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (audio.currentTime >= duration - 0.04) {
        window.setTimeout(finish, 48);
      }
    };
    const onError = () => fail(new Error("音频播放失败"));
    const onAbort = () => fail(new DOMException("Aborted", "AbortError"));

    const cleanup = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });

    if (signal?.aborted) {
      onAbort();
      return;
    }
    if (audio.ended) {
      finish();
    }
  });
}
