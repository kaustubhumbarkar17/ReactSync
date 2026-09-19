import type { PlayerCommand, RuntimeMessage } from "../shared/messages";
import { applyHtml5Command, watchHtml5Player } from "./html5-player";

const SELECTORS = [
  "#video-container video",
  ".shaka-video-container video",
  ".player-base video",
  ".content-player video",
];

function findHotstarVideo(): HTMLVideoElement | null {
  for (const selector of SELECTORS) {
    const node = document.querySelector(selector);
    if (node instanceof HTMLVideoElement && !node.closest("#ad-video-container")) {
      return node;
    }
  }

  const videos = Array.from(document.querySelectorAll("video"));
  return (
    videos.find((video) => !video.closest("#ad-video-container") && video.offsetWidth > 160) ??
    null
  );
}

watchHtml5Player(findHotstarVideo, (reply) => {
  chrome.runtime.sendMessage({ kind: "PLAYER_EVENT", reply } satisfies RuntimeMessage).catch(() => {
    /* side panel may be closed */
  });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.kind !== "TO_PLAYER") return;
  void applyHtml5Command(findHotstarVideo(), message.command as PlayerCommand, "hotstar").then(
    sendResponse,
  );
  return true;
});
