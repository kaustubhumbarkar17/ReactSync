import type { LinkReply, RuntimeMessage } from "../shared/messages";
import { siteLabel } from "../shared/sites";
import { STAGE_CHANNEL, type PlayerToStageMessage, type StageToPlayerMessage } from "../shared/stage";
import { formatTimestamp } from "../shared/time";

const KEY_SEEK_SECONDS = 5;
const HIDE_MS = 2600;

const video = document.querySelector<HTMLVideoElement>("video[data-stage]");
const hud = document.querySelector<HTMLElement>("[data-hud]");
const menu = document.querySelector<HTMLElement>("[data-menu]");
const panel = document.querySelector<HTMLElement>("[data-panel]");
const toggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
const play = document.querySelector<HTMLButtonElement>("[data-play]");
const timeline = document.querySelector<HTMLInputElement>("[data-timeline]");
const now = document.querySelector<HTMLElement>("[data-now]");
const duration = document.querySelector<HTMLElement>("[data-duration]");
const overlay = document.querySelector<HTMLInputElement>("[data-overlay]");
const volume = document.querySelector<HTMLInputElement>("[data-volume]");
const showClock = document.querySelector<HTMLElement>("[data-show-clock]");
const linked = document.querySelector<HTMLElement>("[data-linked]");
const offset = document.querySelector<HTMLElement>("[data-offset]");
const status = document.querySelector<HTMLElement>("[data-status]");
const fsShow = document.querySelector<HTMLButtonElement>("[data-fs-show]");

if (
  video &&
  hud &&
  menu &&
  panel &&
  toggle &&
  play &&
  timeline &&
  now &&
  duration &&
  overlay &&
  volume &&
  showClock &&
  linked &&
  offset &&
  status &&
  fsShow
) {
  const channel = new BroadcastChannel(STAGE_CHANNEL);
  let applying = false;
  let scrubbing = false;
  let hideTimer = 0;

  const post = (message: StageToPlayerMessage) => channel.postMessage(message);

  const seekBy = (delta: number) => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration);
  };

  const refreshTimes = () => {
    now.textContent = formatTimestamp(video.currentTime || 0);
    duration.textContent = formatTimestamp(video.duration || 0);
    if (!scrubbing) {
      timeline.value = String(video.currentTime || 0);
    }
    timeline.max = String(Number.isFinite(video.duration) ? video.duration : 0);
    play.classList.toggle("is-playing", !video.paused);
    play.setAttribute("aria-label", video.paused ? "Play" : "Pause");
  };

  const setMenuOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    hud.classList.toggle("open", open);
    if (open) hud.classList.add("visible");
  };

  const showHud = () => {
    hud.classList.add("visible");
    window.clearTimeout(hideTimer);
    if (panel.hidden) {
      hideTimer = window.setTimeout(() => {
        hud.classList.remove("visible");
      }, HIDE_MS);
    }
  };

  const leave = () => {
    post({ kind: "closed" });
    window.close();
  };

  channel.addEventListener("message", (event: MessageEvent<PlayerToStageMessage>) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.kind === "close") {
      window.close();
      return;
    }
    if (data.kind === "hud") {
      if (document.activeElement !== overlay) overlay.value = data.overlay;
      if (document.activeElement !== volume) volume.value = String(data.volume);
      showClock.textContent = data.showClock;
      linked.textContent = data.linkedLabel;
      offset.textContent = data.offsetLabel;
      if (document.activeElement !== overlay) {
        status.textContent = data.status;
        status.className = `status ${data.statusKind}`.trim();
      }
      fsShow.disabled = !data.showFullscreenEnabled;
      return;
    }
    if (data.kind !== "init") return;
    applying = true;
    if (video.src !== data.src) video.src = data.src;
    const applyTime = () => {
      video.currentTime = data.currentTime;
      video.volume = data.volume;
      volume.value = String(data.volume);
      const playOrPause = data.paused ? video.pause() : video.play();
      void Promise.resolve(playOrPause).finally(() => {
        applying = false;
        refreshTimes();
      });
    };
    if (video.readyState >= 1) applyTime();
    else video.addEventListener("loadedmetadata", applyTime, { once: true });
  });

  video.addEventListener("play", () => {
    refreshTimes();
    if (!applying) post({ kind: "play", currentTime: video.currentTime || 0 });
  });
  video.addEventListener("pause", () => {
    refreshTimes();
    if (!applying) post({ kind: "pause", currentTime: video.currentTime || 0 });
  });
  video.addEventListener("seeked", () => {
    refreshTimes();
    if (!applying) post({ kind: "seek", currentTime: video.currentTime || 0 });
  });
  video.addEventListener("timeupdate", refreshTimes);
  video.addEventListener("loadedmetadata", refreshTimes);

  play.addEventListener("click", () => {
    if (video.paused) void video.play();
    else video.pause();
  });

  timeline.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  timeline.addEventListener("pointerup", () => {
    scrubbing = false;
    video.currentTime = Number(timeline.value);
  });
  timeline.addEventListener("input", () => {
    now.textContent = formatTimestamp(Number(timeline.value));
  });
  timeline.addEventListener("change", () => {
    video.currentTime = Number(timeline.value);
  });

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setMenuOpen(panel.hidden);
    showHud();
  });

  const setHudStatus = (text: string, kind: "ok" | "error" | "" = "") => {
    status.textContent = text;
    status.className = `status ${kind}`.trim();
  };

  const inExtension = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);

  const sendRuntime = (message: RuntimeMessage) =>
    chrome.runtime.sendMessage(message) as Promise<LinkReply>;

  const linkWatchTab = async () => {
    if (!inExtension) {
      post({ kind: "link" });
      setHudStatus("Linking the mock streamer…");
      return;
    }
    try {
      const reply = await sendRuntime({ kind: "LINK_ACTIVE_TAB" });
      if (!reply?.ok) {
        setHudStatus(reply?.error || "Could not link the watch tab.", "error");
        return;
      }
      linked.textContent = `${siteLabel(reply.link.site)} · ${reply.link.title}`;
      fsShow.disabled = false;
      setHudStatus(`Linked ${siteLabel(reply.link.site)}. Type the timestamp and press Sync.`, "ok");
      post({ kind: "linked" });
    } catch {
      setHudStatus("Could not reach the extension. Keep the side panel open and try again.", "error");
      post({ kind: "link" });
    }
  };

  document.querySelector("[data-link]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    void linkWatchTab();
  });
  document.querySelector("[data-sync]")?.addEventListener("click", () => {
    post({ kind: "sync", overlay: overlay.value });
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Enter") post({ kind: "sync", overlay: overlay.value });
  });
  volume.addEventListener("input", () => {
    video.volume = Number(volume.value);
    post({ kind: "volume", volume: Number(volume.value) });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-nudge]").forEach((button) => {
    button.addEventListener("click", () => {
      const delta = Number(button.dataset.nudge);
      if (!Number.isFinite(delta)) return;
      post({ kind: "nudge", delta });
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-present]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.present;
      if (mode === "reaction" || mode === "show" || mode === "exit") {
        post({ kind: "present", mode });
      }
    });
  });

  document.addEventListener("mousemove", showHud);
  document.addEventListener("pointerdown", showHud);

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target as Node)) setMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!panel.hidden) {
        setMenuOpen(false);
        return;
      }
      leave();
      return;
    }
    if (event.repeat) return;
    if (event.key === " " || event.code === "Space") {
      if (event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      if (video.paused) void video.play();
      else video.pause();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    seekBy(event.key === "ArrowLeft" ? -KEY_SEEK_SECONDS : KEY_SEEK_SECONDS);
  });

  window.addEventListener("pagehide", () => {
    post({ kind: "closed" });
  });

  showHud();
  post({ kind: "ready" });
  if (inExtension) {
    void sendRuntime({ kind: "GET_LINK" }).then((reply) => {
      if (!reply?.ok) return;
      linked.textContent = `${siteLabel(reply.link.site)} · ${reply.link.title}`;
      fsShow.disabled = false;
    });
  }
}
