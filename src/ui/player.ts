import {
  DRIFT_POLL_MS,
  DRIFT_SEEK_THRESHOLD,
  lockSync,
  nudgeLock,
  showTimeFor,
  type SyncLock,
} from "../shared/sync";
import { formatOffset, formatTimestamp, parseTimestamp } from "../shared/time";
import { siteLabel } from "../shared/sites";
import type { LinkInfo } from "../shared/messages";
import { STAGE_CHANNEL, type PlayerToStageMessage, type StageToPlayerMessage } from "../shared/stage";
import { createTransport, type Transport } from "./transport";

function sampleReactionUrl(mode: "extension" | "demo"): string {
  if (mode === "extension" && typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL("media/reaction.mp4");
  }
  return "/media/reaction.mp4";
}

const OFFSET_KEY = "reactionSync.offset";
const KEY_SEEK_SECONDS = 5;

function screenLeft(): number {
  const screen = window.screen as Screen & { availLeft?: number };
  return screen.availLeft || 0;
}

function screenTop(): number {
  const screen = window.screen as Screen & { availTop?: number };
  return screen.availTop || 0;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = target instanceof HTMLInputElement ? target.type : "";
  return type !== "range";
}

export function mountPlayer(root: HTMLElement) {
  const transport: Transport = createTransport();
  root.innerHTML = renderShell(transport.mode);
  const ui = bind(root);
  const reaction = ui.video;

  let objectUrl: string | null = null;
  let lock: SyncLock | null = null;
  let link: LinkInfo | null = null;
  let applyingRemote = false;
  let lastSeekSent = 0;
  let showWindowFullscreen = false;
  let reactionStageOpen = false;
  let mirroringStage = false;
  let lastHudAt = 0;
  const stageChannel = new BroadcastChannel(STAGE_CHANNEL);

  const setStatus = (text: string, kind: "ok" | "error" | "" = "") => {
    ui.status.textContent = text;
    ui.status.className = `status ${kind}`.trim();
    pushHud(true);
  };

  const persistOffset = () => {
    const payload = lock ? JSON.stringify(lock) : "";
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      void chrome.storage.local.set({ [OFFSET_KEY]: payload });
    } else {
      localStorage.setItem(OFFSET_KEY, payload);
    }
  };

  const restoreOffset = async () => {
    let raw = "";
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(OFFSET_KEY);
      raw = String(stored[OFFSET_KEY] ?? "");
    } else {
      raw = localStorage.getItem(OFFSET_KEY) ?? "";
    }
    if (!raw) return;
    try {
      lock = JSON.parse(raw) as SyncLock;
      refreshLockLabel();
    } catch {
      lock = null;
    }
  };

  const refreshLockLabel = () => {
    ui.offset.textContent = lock ? formatOffset(lock.offsetSeconds) : "not locked";
    ui.showClock.textContent = lock
      ? `Show ${formatTimestamp(showTimeFor(reaction.currentTime || 0, lock))}`
      : "Show --:--";
    pushHud();
  };

  const refreshTimes = () => {
    ui.now.textContent = formatTimestamp(reaction.currentTime || 0);
    ui.duration.textContent = formatTimestamp(reaction.duration || 0);
    if (!ui.scrubbing) {
      ui.timeline.value = String(reaction.currentTime || 0);
    }
    ui.timeline.max = String(reaction.duration || 0);
    refreshLockLabel();
  };

  const send = async (command: Parameters<Transport["send"]>[0], quiet = false) => {
    const reply = await transport.send(command);
    if (!reply.ok && !quiet) setStatus(reply.error, "error");
    return reply;
  };

  const seekShow = async (seconds: number) => {
    lastSeekSent = Date.now();
    return send({ type: "SEEK", seconds });
  };

  const driveShow = async () => {
    if (!lock || !link) return;
    await seekShow(showTimeFor(reaction.currentTime, lock));
  };

  const onReactionPlay = async () => {
    if (!lock || !link) return;
    applyingRemote = true;
    await seekShow(showTimeFor(reaction.currentTime, lock));
    const reply = await send({ type: "PLAY" }, true);
    applyingRemote = false;
    if (!reply.ok) {
      setStatus(reply.error, "error");
      return;
    }
    if (reply.buffering) {
      reaction.pause();
      setStatus("Show is buffering. Reaction paused until it catches up.", "");
    }
  };

  const onReactionPause = async () => {
    if (!lock || !link || applyingRemote) return;
    await send({ type: "PAUSE" });
  };

  const syncFromOverlay = async () => {
    const overlay = parseTimestamp(ui.overlay.value);
    if (overlay == null) {
      setStatus("Type the overlay time as 1:23 or 1:23:45.", "error");
      return;
    }
    if (!link) {
      setStatus("Link the watch tab first.", "error");
      return;
    }
    lock = lockSync(reaction.currentTime || 0, overlay);
    persistOffset();
    refreshLockLabel();
    await driveShow();
    if (!reaction.paused) await send({ type: "PLAY" });
    setStatus(
      `Locked. When this reaction is at ${formatTimestamp(reaction.currentTime || 0)}, the show should be at ${formatTimestamp(overlay)}.`,
      "ok",
    );
  };

  const nudge = async (delta: number) => {
    if (!lock) {
      setStatus("Sync once before nudging.", "error");
      return;
    }
    lock = nudgeLock(lock, delta);
    persistOffset();
    refreshLockLabel();
    await driveShow();
    setStatus(`Offset is now ${formatOffset(lock.offsetSeconds)}.`, "ok");
  };

  const applyLink = (next: LinkInfo | null) => {
    link = next;
    if (!link) {
      ui.linked.textContent = "No tab linked";
      ui.fsShow.disabled = true;
      ui.fsShow.textContent = "Show as fullscreen";
      pushHud(true);
      return;
    }
    ui.linked.textContent = `${siteLabel(link.site)} · ${link.title}`;
    ui.fsShow.disabled = false;
    ui.fsShow.textContent = `${siteLabel(link.site)} as fullscreen`;
    pushHud(true);
  };

  const linkTab = async () => {
    const reply = await transport.linkActiveTab();
    if (!reply.ok) {
      applyLink(null);
      setStatus(reply.error, "error");
      return;
    }
    applyLink(reply.link);
    setStatus(`Linked ${siteLabel(reply.link.site)}. Type the overlay time and press Sync.`, "ok");
  };

  const closeFullscreenMenu = () => {
    ui.fsPanel.hidden = true;
    ui.fsToggle.setAttribute("aria-expanded", "false");
  };

  const toggleFullscreenMenu = () => {
    const open = ui.fsPanel.hidden;
    ui.fsPanel.hidden = !open;
    ui.fsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const reactionIsFullscreen = () =>
    document.fullscreenElement === reaction || document.fullscreenElement === ui.videoShell;
  const reactionIsPip = () => document.pictureInPictureElement === reaction;

  const refreshFullscreenUi = () => {
    const active =
      reactionIsFullscreen() || showWindowFullscreen || reactionIsPip() || reactionStageOpen;
    ui.fsExit.hidden = !active;
    ui.fsToggle.textContent = active ? "Exit fullscreen" : "Fullscreen";
    pushHud(true);
  };

  const postToStage = (message: PlayerToStageMessage) => {
    stageChannel.postMessage(message);
  };

  const stageInitPayload = (): PlayerToStageMessage => ({
    kind: "init",
    src: reaction.currentSrc || reaction.src,
    currentTime: reaction.currentTime || 0,
    paused: reaction.paused,
    volume: reaction.volume,
  });

  const pushHud = (force = false) => {
    const now = Date.now();
    if (!force && now - lastHudAt < 200) return;
    lastHudAt = now;
    const kind: "ok" | "error" | "" = ui.status.classList.contains("error")
      ? "error"
      : ui.status.classList.contains("ok")
        ? "ok"
        : "";
    postToStage({
      kind: "hud",
      overlay: ui.overlay.value,
      offsetLabel: ui.offset.textContent || "not locked",
      showClock: ui.showClock.textContent || "Show --:--",
      linkedLabel: ui.linked.textContent || "No tab linked",
      status: ui.status.textContent || "",
      statusKind: kind,
      volume: reaction.volume,
      showFullscreenEnabled: Boolean(link),
      presenting: activePresent(),
    });
  };

  const activePresent = () =>
    reactionIsFullscreen() || showWindowFullscreen || reactionIsPip() || reactionStageOpen;

  const leaveReactionStage = async () => {
    if (!reactionStageOpen) return;
    reactionStageOpen = false;
    reaction.muted = false;
    postToStage({ kind: "close" });
    await transport.closeReactionStage();
    refreshFullscreenUi();
  };

  const seekReactionBy = (delta: number) => {
    if (!Number.isFinite(reaction.duration) || reaction.duration <= 0) return;
    const next = Math.min(Math.max(0, (reaction.currentTime || 0) + delta), reaction.duration);
    reaction.currentTime = next;
  };

  const openReactionStageWindow = async () => {
    if (showWindowFullscreen) {
      const reply = await transport.setWatchWindow("restore");
      showWindowFullscreen = false;
      if (!reply.ok) setStatus(reply.error, "error");
    }
    if (reactionIsPip()) {
      await document.exitPictureInPicture().catch(() => undefined);
    }
    const reply = await transport.openReactionStage({
      left: screenLeft(),
      top: screenTop(),
      width: window.screen.availWidth,
      height: window.screen.availHeight,
    });
    if (!reply.ok) {
      setStatus(reply.error, "error");
      refreshFullscreenUi();
      return;
    }
    reactionStageOpen = true;
    reaction.muted = true;
    ui.openStage.disabled = false;
    postToStage(stageInitPayload());
    pushHud(true);
    window.setTimeout(() => {
      if (reactionStageOpen) {
        postToStage(stageInitPayload());
        pushHud(true);
      }
    }, 250);
    setStatus("Reaction is fullscreen. Esc or Exit fullscreen to leave.", "ok");
    refreshFullscreenUi();
  };

  const enterReactionFullscreen = async () => {
    if (!reaction.src) {
      setStatus("Load a reaction first.", "error");
      return;
    }
    closeFullscreenMenu();
    await openReactionStageWindow();
  };

  const enterShowFullscreen = async () => {
    if (!reaction.src) {
      setStatus("Load a reaction first.", "error");
      return;
    }
    if (!link) {
      setStatus("Link the watch tab first.", "error");
      return;
    }
    closeFullscreenMenu();
    await leaveReactionStage();
    if (reactionIsFullscreen()) {
      await document.exitFullscreen().catch(() => undefined);
    }
    ui.videoShell.classList.remove("empty-video");
    try {
      if (reaction.paused) await reaction.play();
      if (!reactionIsPip()) await reaction.requestPictureInPicture();
    } catch {
      setStatus("Could not open Picture-in-Picture. Allow it and try again.", "error");
      return;
    }
    const reply = await transport.setWatchWindow("fullscreen");
    if (!reply.ok) {
      showWindowFullscreen = false;
      setStatus(reply.error, "error");
      refreshFullscreenUi();
      return;
    }
    showWindowFullscreen = true;
    setStatus(
      `${siteLabel(link.site)} is fullscreen. The reaction is in Picture-in-Picture.`,
      "ok",
    );
    refreshFullscreenUi();
  };

  const exitPresentModes = async () => {
    closeFullscreenMenu();
    await leaveReactionStage();
    if (reactionIsFullscreen()) {
      await document.exitFullscreen().catch(() => undefined);
    }
    if (reactionIsPip()) {
      await document.exitPictureInPicture().catch(() => undefined);
    }
    if (showWindowFullscreen) {
      const reply = await transport.setWatchWindow("restore");
      showWindowFullscreen = false;
      if (!reply.ok) setStatus(reply.error, "error");
      else setStatus("Left fullscreen.", "");
    }
    refreshFullscreenUi();
  };

  const loadFile = (file: File) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    reaction.src = objectUrl;
    ui.videoShell.classList.remove("empty-video");
    ui.empty.hidden = true;
    ui.fileName.textContent = file.name;
    ui.openStage.disabled = false;
    setStatus("Reaction opened fullscreen. Use Options to link, type the timestamp, and sync.", "");
    void openReactionStageWindow();
  };

  ui.fileInput.addEventListener("change", () => {
    const file = ui.fileInput.files?.[0];
    if (file) loadFile(file);
  });

  ui.sample.addEventListener("click", () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    reaction.src = sampleReactionUrl(transport.mode);
    ui.videoShell.classList.remove("empty-video");
    ui.empty.hidden = true;
    ui.fileName.textContent = "Sample reaction (local overlay clip)";
    ui.openStage.disabled = false;
    setStatus("Reaction opened fullscreen. Use Options to link, type the timestamp, and sync.", "");
    void openReactionStageWindow();
  });

  ui.play.addEventListener("click", () => {
    if (reaction.paused) void reaction.play();
    else reaction.pause();
  });

  ui.fsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!ui.fsExit.hidden) {
      void exitPresentModes();
      return;
    }
    toggleFullscreenMenu();
  });
  ui.fsReaction.addEventListener("click", () => void enterReactionFullscreen());
  ui.fsShow.addEventListener("click", () => void enterShowFullscreen());
  ui.fsExit.addEventListener("click", () => void exitPresentModes());
  ui.openStage.addEventListener("click", () => void enterReactionFullscreen());

  ui.sync.addEventListener("click", () => void syncFromOverlay());
  ui.link.addEventListener("click", () => void linkTab());
  ui.nudgeBack01.addEventListener("click", () => void nudge(-0.1));
  ui.nudgeFwd01.addEventListener("click", () => void nudge(0.1));
  ui.nudgeBack1.addEventListener("click", () => void nudge(-1));
  ui.nudgeFwd1.addEventListener("click", () => void nudge(1));

  ui.overlay.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void syncFromOverlay();
  });

  reaction.addEventListener("play", () => {
    ui.play.textContent = "Pause";
    void onReactionPlay();
  });
  reaction.addEventListener("pause", () => {
    ui.play.textContent = "Play";
    void onReactionPause();
  });
  reaction.addEventListener("seeked", () => {
    refreshTimes();
    if (lock && link && !mirroringStage) void driveShow();
  });
  reaction.addEventListener("timeupdate", refreshTimes);
  reaction.addEventListener("loadedmetadata", refreshTimes);

  ui.timeline.addEventListener("pointerdown", () => {
    ui.scrubbing = true;
  });
  ui.timeline.addEventListener("pointerup", () => {
    ui.scrubbing = false;
    reaction.currentTime = Number(ui.timeline.value);
  });
  ui.timeline.addEventListener("input", () => {
    ui.now.textContent = formatTimestamp(Number(ui.timeline.value));
  });

  ui.volume.addEventListener("input", () => {
    reaction.volume = Number(ui.volume.value);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeFullscreenMenu();
    if (event.repeat || isTypingTarget(event.target)) return;
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (!reaction.src) return;
      if (reaction.paused) void reaction.play();
      else reaction.pause();
      if (reactionStageOpen) postToStage(stageInitPayload());
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    seekReactionBy(event.key === "ArrowLeft" ? -KEY_SEEK_SECONDS : KEY_SEEK_SECONDS);
  });

  document.addEventListener("click", (event) => {
    if (!ui.fsMenu.contains(event.target as Node)) closeFullscreenMenu();
  });

  document.addEventListener("fullscreenchange", () => {
    refreshFullscreenUi();
  });
  reaction.addEventListener("enterpictureinpicture", () => {
    refreshFullscreenUi();
  });
  reaction.addEventListener("leavepictureinpicture", () => {
    if (showWindowFullscreen) {
      void transport.setWatchWindow("restore").then((reply) => {
        showWindowFullscreen = false;
        if (!reply.ok) setStatus(reply.error, "error");
        refreshFullscreenUi();
      });
      return;
    }
    refreshFullscreenUi();
  });

  stageChannel.addEventListener("message", (event: MessageEvent<StageToPlayerMessage>) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.kind === "ready") {
      if (reaction.src) {
        reactionStageOpen = true;
        reaction.muted = true;
        ui.openStage.disabled = false;
        postToStage(stageInitPayload());
        pushHud(true);
      }
      return;
    }
    if (data.kind === "closed") {
      if (!reactionStageOpen) return;
      reactionStageOpen = false;
      reaction.muted = false;
      refreshFullscreenUi();
      setStatus("Left fullscreen.", "");
      return;
    }
    if (data.kind === "link") {
      void linkTab();
      return;
    }
    if (data.kind === "linked") {
      void transport.getLink().then((reply) => {
        if (reply.ok) {
          applyLink(reply.link);
          setStatus(`Linked ${siteLabel(reply.link.site)}. Type the overlay time and press Sync.`, "ok");
        }
      });
      return;
    }
    if (data.kind === "sync") {
      ui.overlay.value = data.overlay;
      void syncFromOverlay();
      return;
    }
    if (data.kind === "nudge") {
      void nudge(data.delta);
      return;
    }
    if (data.kind === "volume") {
      reaction.volume = data.volume;
      ui.volume.value = String(data.volume);
      return;
    }
    if (data.kind === "present") {
      if (data.mode === "show") void enterShowFullscreen();
      else if (data.mode === "exit") void exitPresentModes();
      else void enterReactionFullscreen();
      return;
    }
    if (!reactionStageOpen) return;
    mirroringStage = true;
    if (typeof data.currentTime === "number") reaction.currentTime = data.currentTime;
    if (data.kind === "play") {
      reaction.muted = true;
      if (reaction.paused) void reaction.play();
    } else if (data.kind === "pause") {
      if (!reaction.paused) reaction.pause();
    }
    window.setTimeout(() => {
      mirroringStage = false;
    }, 0);
  });

  transport.onPlayerEvent((reply) => {
    if (!reply.ok || !lock || applyingRemote) return;
    if (reply.buffering && !reaction.paused) {
      applyingRemote = true;
      ui.resumeAfterBuffer = true;
      reaction.pause();
      applyingRemote = false;
      if (reactionStageOpen) postToStage(stageInitPayload());
      setStatus("Show is buffering. Reaction paused until it catches up.", "");
      return;
    }
    if (!reply.buffering && reaction.paused && ui.resumeAfterBuffer) {
      ui.resumeAfterBuffer = false;
      void reaction.play().then(() => {
        if (reactionStageOpen) postToStage(stageInitPayload());
      });
    }
  });

  window.setInterval(() => {
    if (!lock || !link || reaction.paused) return;
    if (Date.now() - lastSeekSent < 350) return;
    void transport.send({ type: "GET_STATE" }).then((reply) => {
      if (!reply.ok || !lock) return;
      const expected = showTimeFor(reaction.currentTime, lock);
      if (Math.abs(reply.currentTime - expected) >= DRIFT_SEEK_THRESHOLD) {
        void seekShow(expected);
      }
    });
  }, DRIFT_POLL_MS);

  void restoreOffset();
  void transport.getLink().then((reply) => {
    if (reply.ok) applyLink(reply.link);
  });

  if (transport.mode === "demo") {
    setStatus("Demo mode. Open the mock streamer, then load a reaction to go fullscreen.", "");
  } else {
    setStatus("Load a reaction to go fullscreen. Link Netflix, JioHotstar, or Prime Video from Options.", "");
  }
}

function renderShell(mode: "extension" | "demo"): string {
  const demoHint =
    mode === "demo"
      ? `<p class="hint">Open the <a href="/mock-streamer/" target="_blank" rel="noreferrer">mock streamer</a> in another tab first. After the reaction goes fullscreen, use Options to link and sync.</p>`
      : `<p class="hint">Load a reaction to open it fullscreen. Link the show, type the burned-in timestamp, and sync from Options.</p>`;

  return `
    <header class="header">
      <h1>Reaction Sync</h1>
      ${demoHint}
    </header>
    <div class="import">
      <label class="file-btn">Load reaction<input type="file" accept="video/*" data-file /></label>
      <button type="button" data-sample>Use sample clip</button>
      <button type="button" class="primary" data-open-stage disabled>Open fullscreen</button>
    </div>
    <p class="hint" data-file-name></p>
    <div class="status" data-status>Waiting for a reaction file.</div>
    <p class="hint">Linked: <span data-linked>No tab linked</span> · Offset: <span data-offset>not locked</span></p>
    <div class="engine">
      <div class="video-shell empty-video" data-video-shell>
        <video playsinline></video>
        <div class="clock" data-show-clock>Show --:--</div>
        <p class="empty" data-empty>No reaction loaded yet. Pick a local file, or use the sample clip to try the lock.</p>
      </div>
      <div class="times">
        <span data-now>0:00</span>
        <span data-duration>0:00</span>
      </div>
      <div class="timeline">
        <input type="range" min="0" max="0" value="0" step="0.05" data-timeline />
      </div>
      <div class="actions">
        <button type="button" data-play disabled>Play</button>
        <div class="fs-menu" data-fs-menu>
          <button type="button" data-fs-toggle aria-expanded="false" aria-haspopup="true">Fullscreen</button>
          <div class="fs-menu-panel" hidden data-fs-panel>
            <button type="button" data-fs-reaction>Reaction as fullscreen</button>
            <button type="button" data-fs-show disabled>Show as fullscreen</button>
            <button type="button" data-fs-exit hidden>Exit fullscreen</button>
          </div>
        </div>
        <button type="button" class="primary" data-link>Link tab</button>
      </div>
      <div class="row">
        <label>Overlay time on the reaction
          <input type="text" inputmode="numeric" placeholder="1:23:45" data-overlay />
        </label>
        <button type="button" class="primary" data-sync>Sync</button>
      </div>
      <div class="row nudge">
        <button type="button" data-nudge="-1">−1s</button>
        <button type="button" data-nudge="-0.1">−0.1s</button>
        <button type="button" data-nudge="0.1">+0.1s</button>
        <button type="button" data-nudge="1">+1s</button>
      </div>
      <div class="volume">
        <span>Reaction volume</span>
        <input type="range" min="0" max="1" step="0.01" value="1" data-volume />
      </div>
    </div>
  `;
}

function bind(root: HTMLElement) {
  const video = root.querySelector("video");
  if (!video) throw new Error("Missing video element");
  const play = root.querySelector<HTMLButtonElement>("[data-play]");
  const fileInput = root.querySelector<HTMLInputElement>("[data-file]");
  const fsToggle = root.querySelector<HTMLButtonElement>("[data-fs-toggle]");
  const fsPanel = root.querySelector<HTMLElement>("[data-fs-panel]");
  const fsMenu = root.querySelector<HTMLElement>("[data-fs-menu]");
  const fsReaction = root.querySelector<HTMLButtonElement>("[data-fs-reaction]");
  const fsShow = root.querySelector<HTMLButtonElement>("[data-fs-show]");
  const fsExit = root.querySelector<HTMLButtonElement>("[data-fs-exit]");
  if (!play || !fileInput) throw new Error("Missing player controls");
  if (!fsToggle || !fsPanel || !fsMenu || !fsReaction || !fsShow || !fsExit) {
    throw new Error("Missing fullscreen controls");
  }

  const openStage = root.querySelector<HTMLButtonElement>("[data-open-stage]");
  if (!openStage) throw new Error("Missing fullscreen launcher");

  video.addEventListener("loadedmetadata", () => {
    play.disabled = false;
    openStage.disabled = false;
  });

  return {
    video,
    openStage,
    videoShell: root.querySelector("[data-video-shell]") as HTMLElement,
    empty: root.querySelector("[data-empty]") as HTMLElement,
    showClock: root.querySelector("[data-show-clock]") as HTMLElement,
    now: root.querySelector("[data-now]") as HTMLElement,
    duration: root.querySelector("[data-duration]") as HTMLElement,
    timeline: root.querySelector("[data-timeline]") as HTMLInputElement,
    fileInput,
    sample: root.querySelector("[data-sample]") as HTMLButtonElement,
    play,
    fsMenu,
    fsToggle,
    fsPanel,
    fsReaction,
    fsShow,
    fsExit,
    link: root.querySelector("[data-link]") as HTMLButtonElement,
    fileName: root.querySelector("[data-file-name]") as HTMLElement,
    overlay: root.querySelector("[data-overlay]") as HTMLInputElement,
    sync: root.querySelector("[data-sync]") as HTMLButtonElement,
    nudgeBack1: root.querySelector('[data-nudge="-1"]') as HTMLButtonElement,
    nudgeBack01: root.querySelector('[data-nudge="-0.1"]') as HTMLButtonElement,
    nudgeFwd01: root.querySelector('[data-nudge="0.1"]') as HTMLButtonElement,
    nudgeFwd1: root.querySelector('[data-nudge="1"]') as HTMLButtonElement,
    volume: root.querySelector("[data-volume]") as HTMLInputElement,
    status: root.querySelector("[data-status]") as HTMLElement,
    linked: root.querySelector("[data-linked]") as HTMLElement,
    offset: root.querySelector("[data-offset]") as HTMLElement,
    scrubbing: false,
    resumeAfterBuffer: false,
  };
}
