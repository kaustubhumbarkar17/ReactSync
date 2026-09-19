import { CHANNEL_NAME, type PlayerCommand, type PlayerReply } from "../src/shared/messages";
import { applyHtml5Command, readVideoState } from "../src/content/html5-player";
import { formatTimestamp } from "../src/shared/time";

const video = document.querySelector<HTMLVideoElement>("[data-reaction-sync='show']");
const clock = document.querySelector("[data-clock]");
const stateLabel = document.querySelector("[data-state]");
const timeLabel = document.querySelector("[data-time]");

if (!(video instanceof HTMLVideoElement) || !clock || !stateLabel || !timeLabel) {
  throw new Error("Mock streamer markup is incomplete.");
}

const show = video;
const clockEl = clock;
const stateEl = stateLabel;
const timeEl = timeLabel;

const channel = new BroadcastChannel(CHANNEL_NAME);

function paint() {
  const state = readVideoState(show, "mock");
  if (!state.ok) return;
  clockEl.textContent = formatTimestamp(state.currentTime);
  timeEl.textContent = formatTimestamp(state.currentTime);
  stateEl.textContent = state.buffering ? "Buffering" : state.playing ? "Playing" : "Paused";
}

function emit(reply: PlayerReply) {
  channel.postMessage({ kind: "demo-event", reply });
  paint();
}

channel.addEventListener("message", async (event) => {
  const data = event.data as { kind?: string; id?: string; command?: PlayerCommand };
  if (data.kind !== "demo-command" || !data.id || !data.command) return;
  const reply = await applyHtml5Command(show, data.command, "mock");
  channel.postMessage({ kind: "demo-reply", id: data.id, reply });
  paint();
});

for (const name of ["play", "pause", "seeking", "seeked", "waiting", "playing", "timeupdate"] as const) {
  show.addEventListener(name, () => emit(readVideoState(show, "mock")));
}

paint();
