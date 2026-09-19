import type { PlayerCommand, PlayerReply, SiteId } from "../shared/messages";
import { unlockPictureInPicture } from "../shared/pip";

export type Html5Finder = () => HTMLVideoElement | null;

export function readVideoState(video: HTMLVideoElement | null, site: SiteId): PlayerReply {
  if (!video) {
    return { ok: false, error: "No show player found on this page yet." };
  }

  return {
    ok: true,
    site,
    playing: !video.paused && !video.ended,
    buffering: video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && !video.paused,
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    ready: video.readyState >= HTMLMediaElement.HAVE_METADATA,
  };
}

export async function applyHtml5Command(
  video: HTMLVideoElement | null,
  command: PlayerCommand,
  site: SiteId,
): Promise<PlayerReply> {
  if (command.type === "PING") {
    return video
      ? readVideoState(video, site)
      : { ok: false, error: "Content script is here, but the player is not ready." };
  }

  if (!video) {
    return { ok: false, error: "No show player found on this page yet." };
  }

  try {
    if (command.type === "PLAY") {
      await video.play();
    } else if (command.type === "PAUSE") {
      video.pause();
    } else if (command.type === "SEEK") {
      video.currentTime = Math.max(0, command.seconds);
    }
  } catch (error) {
    return { ok: false, error: playErrorMessage(error) };
  }

  return readVideoState(video, site);
}

export function watchHtml5Player(
  findVideo: Html5Finder,
  onChange: (state: PlayerReply) => void,
): () => void {
  let attached: HTMLVideoElement | null = null;

  const notify = () => onChange(readVideoState(attached, inferSite()));

  const attach = (video: HTMLVideoElement) => {
    if (attached === video) return;
    detach();
    attached = video;
    unlockPictureInPicture(video);
    for (const event of ["play", "pause", "seeking", "seeked", "waiting", "playing", "ended"] as const) {
      video.addEventListener(event, notify);
    }
    notify();
  };

  const detach = () => {
    if (!attached) return;
    for (const event of ["play", "pause", "seeking", "seeked", "waiting", "playing", "ended"] as const) {
      attached.removeEventListener(event, notify);
    }
    attached = null;
  };

  const scan = () => {
    const video = findVideo();
    if (video) attach(video);
  };

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();

  return () => {
    observer.disconnect();
    detach();
  };
}

function playErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : "Playback command failed.";
  if (name === "NotAllowedError") {
    return "The show tab blocked autoplay. Click play once on the show, then press Play here again.";
  }
  if (/no supported sources/i.test(message)) {
    return "The show video has not loaded yet. Wait for a frame, then try Sync again.";
  }
  return message;
}

function inferSite(): SiteId {
  const host = location.hostname;
  if (/(?:^|\.)netflix\.com$/i.test(host)) return "netflix";
  if (/(?:^|\.)(?:jio)?hotstar\.com$/i.test(host)) return "hotstar";
  if (/^(localhost|127\.0\.0\.1)$/i.test(host)) return "mock";
  return "unknown";
}
