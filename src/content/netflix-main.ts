import { NETFLIX_CMD, NETFLIX_RES } from "../shared/messages";

type NetflixPlayer = {
  play: () => void;
  pause: () => void;
  seek: (timeMs: number) => void;
  getCurrentTime?: () => number;
};

type CommandDetail = {
  id: string;
  type: "PING" | "GET_STATE" | "PLAY" | "PAUSE" | "SEEK";
  seconds?: number;
};

function getPlayer(): NetflixPlayer | null {
  const root = (window as unknown as { netflix?: unknown }).netflix as
    | {
        appContext?: {
          state?: {
            playerApp?: {
              getAPI?: () => {
                videoPlayer?: {
                  getAllPlayerSessionIds: () => string[];
                  getVideoPlayerBySessionId: (id: string) => NetflixPlayer;
                };
              };
            };
          };
        };
      }
    | undefined;

  try {
    const api = root?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
    if (!api) return null;
    const sessionIds = api.getAllPlayerSessionIds() ?? [];
    const sessionId =
      sessionIds.find((id) => String(id).startsWith("watch-")) ?? sessionIds[0];
    if (!sessionId) return null;
    return api.getVideoPlayerBySessionId(sessionId);
  } catch {
    return null;
  }
}

function findVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>(".watch-video--player-view video") ??
    document.querySelector("video")
  );
}

function readState() {
  const video = findVideo();
  const player = getPlayer();
  if (!video && !player) {
    return { ok: false as const, error: "Netflix player is not ready. Open a title and press play once." };
  }

  const currentTime = video?.currentTime ?? 0;
  return {
    ok: true as const,
    site: "netflix" as const,
    playing: video ? !video.paused && !video.ended : false,
    buffering: video ? video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && !video.paused : false,
    currentTime,
    duration: video && Number.isFinite(video.duration) ? video.duration : 0,
    ready: Boolean(player || (video && video.readyState >= HTMLMediaElement.HAVE_METADATA)),
  };
}

window.addEventListener(NETFLIX_CMD, (event) => {
  const detail = (event as CustomEvent<CommandDetail>).detail;
  if (!detail?.id) return;

  const player = getPlayer();
  try {
    if (detail.type === "PLAY") {
      if (!player) throw new Error("Netflix player API is missing. Reload the watch page.");
      player.play();
    } else if (detail.type === "PAUSE") {
      if (!player) throw new Error("Netflix player API is missing. Reload the watch page.");
      player.pause();
    } else if (detail.type === "SEEK") {
      if (!player) throw new Error("Netflix player API is missing. Reload the watch page.");
      player.seek(Math.max(0, Math.round((detail.seconds ?? 0) * 1000)));
    }

    window.dispatchEvent(
      new CustomEvent(NETFLIX_RES, {
        detail: { id: detail.id, ...readState() },
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Netflix command failed.";
    window.dispatchEvent(
      new CustomEvent(NETFLIX_RES, {
        detail: { id: detail.id, ok: false, error: message },
      }),
    );
  }
});
