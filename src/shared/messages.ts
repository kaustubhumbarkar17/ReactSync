export const CHANNEL_NAME = "reaction-sync";
export const NETFLIX_CMD = "reaction-sync:cmd";
export const NETFLIX_RES = "reaction-sync:res";

export type SiteId = "netflix" | "hotstar" | "mock" | "unknown";

export type PlayerState = {
  ok: true;
  site: SiteId;
  playing: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
  ready: boolean;
};

export type PlayerError = {
  ok: false;
  error: string;
};

export type PlayerReply = PlayerState | PlayerError;

export type PlayerCommand =
  | { type: "PING" }
  | { type: "GET_STATE" }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SEEK"; seconds: number };

export type RuntimeMessage =
  | { kind: "TO_PLAYER"; command: PlayerCommand }
  | { kind: "FROM_PLAYER"; reply: PlayerReply }
  | { kind: "LINK_ACTIVE_TAB" }
  | { kind: "GET_LINK" }
  | { kind: "CLEAR_LINK" }
  | { kind: "PLAYER_EVENT"; reply: PlayerReply };

export type LinkInfo = {
  tabId: number;
  site: SiteId;
  title: string;
  url: string;
};

export type LinkReply =
  | { ok: true; link: LinkInfo }
  | { ok: false; error: string };

export function isPlayerCommand(value: unknown): value is PlayerCommand {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const type = (value as { type: unknown }).type;
  if (type === "SEEK") {
    return typeof (value as { seconds?: unknown }).seconds === "number";
  }
  return type === "PING" || type === "GET_STATE" || type === "PLAY" || type === "PAUSE";
}
