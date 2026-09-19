import type { PlayerCommand, RuntimeMessage } from "../shared/messages";
import { applyHtml5Command, watchHtml5Player } from "./html5-player";

function findMockVideo(): HTMLVideoElement | null {
  const marked = document.querySelector("[data-reaction-sync='show']");
  if (marked instanceof HTMLVideoElement) return marked;

  const wrapped = document.querySelector("#video-container video");
  if (wrapped instanceof HTMLVideoElement) return wrapped;

  return document.querySelector("video");
}

watchHtml5Player(findMockVideo, (reply) => {
  chrome.runtime.sendMessage({ kind: "PLAYER_EVENT", reply } satisfies RuntimeMessage).catch(() => {
    /* ignore */
  });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.kind !== "TO_PLAYER") return;
  void applyHtml5Command(findMockVideo(), message.command as PlayerCommand, "mock").then(sendResponse);
  return true;
});
