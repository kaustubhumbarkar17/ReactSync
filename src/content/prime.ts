import type { PlayerCommand, RuntimeMessage } from "../shared/messages";
import { applyHtml5Command, watchHtml5Player } from "./html5-player";

const SELECTORS = [
  ".rendererContainer video",
  "#dv-web-player video",
  ".webPlayerSDKContainer video",
  ".atvwebplayersdk-player-container video",
  ".webPlayerContainer video",
];

const AD_HINT = /ad[-_]?breaker|ad[-_]?container|advert|preroll|adsdk/i;

function isAdVideo(video: HTMLVideoElement): boolean {
  let node: HTMLElement | null = video;
  while (node) {
    const id = node.id || "";
    const cls = typeof node.className === "string" ? node.className : "";
    const testId = node.getAttribute("data-testid") || "";
    if (AD_HINT.test(id) || AD_HINT.test(cls) || AD_HINT.test(testId)) return true;
    node = node.parentElement;
  }
  return false;
}

function findPrimeVideo(): HTMLVideoElement | null {
  for (const selector of SELECTORS) {
    const node = document.querySelector(selector);
    if (node instanceof HTMLVideoElement && !isAdVideo(node)) {
      return node;
    }
  }

  const videos = Array.from(document.querySelectorAll("video"));
  return videos.find((video) => !isAdVideo(video) && video.offsetWidth > 160) ?? null;
}

watchHtml5Player(findPrimeVideo, (reply) => {
  chrome.runtime.sendMessage({ kind: "PLAYER_EVENT", reply } satisfies RuntimeMessage).catch(() => {
    /* side panel may be closed */
  });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.kind !== "TO_PLAYER") return;
  void applyHtml5Command(findPrimeVideo(), message.command as PlayerCommand, "prime").then(
    sendResponse,
  );
  return true;
});
