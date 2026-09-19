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
import { createTransport, type Transport } from "./transport";

function sampleReactionUrl(mode: "extension" | "demo"): string {
  if (mode === "extension" && typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL("media/reaction.mp4");
  }
  return "/media/reaction.mp4";
}

const OFFSET_KEY = "reactionSync.offset";

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

  const setStatus = (text: string, kind: "ok" | "error" | "" = "") => {
    ui.status.textContent = text;
    ui.status.className = `status ${kind}`.trim();
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

  const linkTab = async () => {
    const reply = await transport.linkActiveTab();
    if (!reply.ok) {
      link = null;
      setStatus(reply.error, "error");
      ui.linked.textContent = "No tab linked";
      return;
    }
    link = reply.link;
    ui.linked.textContent = `${siteLabel(link.site)} · ${link.title}`;
    setStatus(`Linked ${siteLabel(link.site)}. Type the overlay time and press Sync.`, "ok");
  };

  const loadFile = (file: File) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    reaction.src = objectUrl;
    ui.videoShell.classList.remove("empty-video");
    ui.empty.hidden = true;
    ui.fileName.textContent = file.name;
    setStatus("Reaction loaded. Link the show tab, then lock the overlay time.", "");
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
    setStatus("Sample loaded. Link the show tab, then lock the overlay time.", "");
  });

  ui.play.addEventListener("click", () => {
    if (reaction.paused) void reaction.play();
    else reaction.pause();
  });

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
    if (lock && link) void driveShow();
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

  transport.onPlayerEvent((reply) => {
    if (!reply.ok || !lock || applyingRemote) return;
    if (reply.buffering && !reaction.paused) {
      applyingRemote = true;
      ui.resumeAfterBuffer = true;
      reaction.pause();
      applyingRemote = false;
      setStatus("Show is buffering. Reaction paused until it catches up.", "");
      return;
    }
    if (!reply.buffering && reaction.paused && ui.resumeAfterBuffer) {
      ui.resumeAfterBuffer = false;
      void reaction.play();
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
    if (reply.ok) {
      link = reply.link;
      ui.linked.textContent = `${siteLabel(link.site)} · ${link.title}`;
    }
  });

  if (transport.mode === "demo") {
    setStatus("Demo mode. Open the mock streamer in another tab, then press Link tab.", "");
  } else {
    setStatus("Open Netflix or JioHotstar, press Link tab, then lock the overlay time.", "");
  }
}

function renderShell(mode: "extension" | "demo"): string {
  const demoHint =
    mode === "demo"
      ? `<p class="hint">This preview talks to the <a href="/mock-streamer/" target="_blank" rel="noreferrer">mock streamer</a> in another tab. The Chrome extension uses the same controls against Netflix or JioHotstar.</p>`
      : `<p class="hint">The reaction file is the master clock. After Sync, play, pause, and scrub here move the linked show tab.</p>`;

  return `
    <header class="header">
      <h1>Reaction Sync</h1>
      <p>Load the reaction that shows the show clock. Type that overlay time, press Sync, then this timeline drives the streamer.</p>
      ${demoHint}
    </header>
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
      <label class="file-btn">Load reaction<input type="file" accept="video/*" data-file /></label>
      <button type="button" data-sample>Use sample clip</button>
      <button type="button" data-play disabled>Play</button>
      <button type="button" class="primary" data-link>Link tab</button>
    </div>
    <p class="hint" data-file-name></p>
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
    <div class="status" data-status>Waiting for a reaction file.</div>
    <p class="hint">Linked: <span data-linked>No tab linked</span> · Offset: <span data-offset>not locked</span></p>
  `;
}

function bind(root: HTMLElement) {
  const video = root.querySelector("video");
  if (!video) throw new Error("Missing video element");
  const play = root.querySelector<HTMLButtonElement>("[data-play]");
  const fileInput = root.querySelector<HTMLInputElement>("[data-file]");
  if (!play || !fileInput) throw new Error("Missing player controls");

  video.addEventListener("loadedmetadata", () => {
    play.disabled = false;
  });

  return {
    video,
    videoShell: root.querySelector("[data-video-shell]") as HTMLElement,
    empty: root.querySelector("[data-empty]") as HTMLElement,
    showClock: root.querySelector("[data-show-clock]") as HTMLElement,
    now: root.querySelector("[data-now]") as HTMLElement,
    duration: root.querySelector("[data-duration]") as HTMLElement,
    timeline: root.querySelector("[data-timeline]") as HTMLInputElement,
    fileInput,
    sample: root.querySelector("[data-sample]") as HTMLButtonElement,
    play,
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
