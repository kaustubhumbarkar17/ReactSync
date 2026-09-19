import { STAGE_CHANNEL, type PlayerToStageMessage, type StageToPlayerMessage } from "../shared/stage";

const KEY_SEEK_SECONDS = 5;
const video = document.querySelector<HTMLVideoElement>("video[data-stage]");
if (video) {
  const channel = new BroadcastChannel(STAGE_CHANNEL);
  let applying = false;

  const post = (message: StageToPlayerMessage) => channel.postMessage(message);

  const seekBy = (delta: number) => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration);
  };

  channel.addEventListener("message", (event: MessageEvent<PlayerToStageMessage>) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.kind === "close") {
      window.close();
      return;
    }
    if (data.kind !== "init") return;
    applying = true;
    if (video.src !== data.src) video.src = data.src;
    const applyTime = () => {
      video.currentTime = data.currentTime;
      video.volume = data.volume;
      const playOrPause = data.paused ? video.pause() : video.play();
      void Promise.resolve(playOrPause).finally(() => {
        applying = false;
      });
    };
    if (video.readyState >= 1) applyTime();
    else video.addEventListener("loadedmetadata", applyTime, { once: true });
  });

  video.addEventListener("play", () => {
    if (!applying) post({ kind: "play", currentTime: video.currentTime || 0 });
  });
  video.addEventListener("pause", () => {
    if (!applying) post({ kind: "pause", currentTime: video.currentTime || 0 });
  });
  video.addEventListener("seeked", () => {
    if (!applying) post({ kind: "seek", currentTime: video.currentTime || 0 });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      post({ kind: "closed" });
      window.close();
      return;
    }
    if (event.repeat) return;
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (video.paused) void video.play();
      else video.pause();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    seekBy(event.key === "ArrowLeft" ? -KEY_SEEK_SECONDS : KEY_SEEK_SECONDS);
  });

  window.addEventListener("pagehide", () => {
    post({ kind: "closed" });
  });

  post({ kind: "ready" });
}
