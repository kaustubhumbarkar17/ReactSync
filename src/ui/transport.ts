import {
  CHANNEL_NAME,
  type LinkReply,
  type PlayerCommand,
  type PlayerReply,
  type RuntimeMessage,
  type WatchWindowReply,
  type WatchWindowState,
  type StageWindowBounds,
} from "../shared/messages";

export type Transport = {
  mode: "extension" | "demo";
  send(command: PlayerCommand): Promise<PlayerReply>;
  linkActiveTab(): Promise<LinkReply>;
  getLink(): Promise<LinkReply>;
  clearLink(): Promise<void>;
  setWatchWindow(state: WatchWindowState): Promise<WatchWindowReply>;
  openReactionStage(bounds?: StageWindowBounds): Promise<WatchWindowReply>;
  closeReactionStage(): Promise<WatchWindowReply>;
  onPlayerEvent(handler: (reply: PlayerReply) => void): () => void;
};

export function createTransport(): Transport {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return createExtensionTransport();
  }
  return createDemoTransport();
}

function createExtensionTransport(): Transport {
  return {
    mode: "extension",
    send(command) {
      return chrome.runtime.sendMessage({ kind: "TO_PLAYER", command } satisfies RuntimeMessage);
    },
    linkActiveTab() {
      return chrome.runtime.sendMessage({ kind: "LINK_ACTIVE_TAB" } satisfies RuntimeMessage);
    },
    getLink() {
      return chrome.runtime.sendMessage({ kind: "GET_LINK" } satisfies RuntimeMessage);
    },
    async clearLink() {
      await chrome.runtime.sendMessage({ kind: "CLEAR_LINK" } satisfies RuntimeMessage);
    },
    setWatchWindow(state) {
      return chrome.runtime.sendMessage({
        kind: "SET_WATCH_WINDOW",
        state,
      } satisfies RuntimeMessage);
    },
    openReactionStage(bounds) {
      return chrome.runtime.sendMessage({
        kind: "OPEN_REACTION_STAGE",
        bounds,
      } satisfies RuntimeMessage);
    },
    closeReactionStage() {
      return chrome.runtime.sendMessage({ kind: "CLOSE_REACTION_STAGE" } satisfies RuntimeMessage);
    },
    onPlayerEvent(handler) {
      const listener = (message: RuntimeMessage) => {
        if (message.kind === "FROM_PLAYER") handler(message.reply);
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
  };
}

function createDemoTransport(): Transport {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  let linked = false;

  const send = (command: PlayerCommand) =>
    new Promise<PlayerReply>((resolve) => {
      const id = crypto.randomUUID();
      const timer = window.setTimeout(() => {
        channel.removeEventListener("message", onMessage);
        resolve({
          ok: false,
          error: "Mock streamer did not answer. Open it in another tab on this same origin.",
        });
      }, 1500);

      const onMessage = (event: MessageEvent) => {
        const data = event.data as { kind?: string; id?: string; reply?: PlayerReply };
        if (data.kind !== "demo-reply" || data.id !== id || !data.reply) return;
        window.clearTimeout(timer);
        channel.removeEventListener("message", onMessage);
        resolve(data.reply);
      };

      channel.addEventListener("message", onMessage);
      channel.postMessage({ kind: "demo-command", id, command });
    });

  return {
    mode: "demo",
    send,
    async linkActiveTab() {
      const reply = await send({ type: "PING" });
      if (!reply.ok) return { ok: false, error: reply.error };
      linked = true;
      return {
        ok: true,
        link: {
          tabId: 0,
          site: "mock",
          title: "Mock streamer",
          url: `${location.origin}/mock-streamer/`,
        },
      };
    },
    async getLink() {
      if (!linked) return { ok: false, error: "No tab linked yet." };
      return {
        ok: true,
        link: {
          tabId: 0,
          site: "mock",
          title: "Mock streamer",
          url: `${location.origin}/mock-streamer/`,
        },
      };
    },
    async clearLink() {
      linked = false;
    },
    async setWatchWindow() {
      return {
        ok: false,
        error:
          "Show-window fullscreen is only in the Chrome extension. Use Reaction as fullscreen here, or Picture-in-Picture.",
      };
    },
    async openReactionStage() {
      const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
      const features = `popup=yes,left=${screen.availLeft || 0},top=${screen.availTop || 0},width=${screen.availWidth},height=${screen.availHeight}`;
      const opened =
        window.open("/src/stage/index.html", "reactionSyncStage", features) ||
        window.open("/src/stage/index.html", "reactionSyncStage");
      if (!opened) {
        return { ok: false, error: "The browser blocked the fullscreen window. Allow popups for this page." };
      }
      return { ok: true };
    },
    async closeReactionStage() {
      window.open("", "reactionSyncStage")?.close();
      return { ok: true };
    },
    onPlayerEvent(handler) {
      const listener = (event: MessageEvent) => {
        const data = event.data as { kind?: string; reply?: PlayerReply };
        if (data.kind === "demo-event" && data.reply) handler(data.reply);
      };
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    },
  };
}
