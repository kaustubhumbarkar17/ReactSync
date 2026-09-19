export const STAGE_CHANNEL = "reaction-sync-stage";

export type StageInitMessage = {
  kind: "init";
  src: string;
  currentTime: number;
  paused: boolean;
  volume: number;
};

export type StageHudState = {
  kind: "hud";
  overlay: string;
  offsetLabel: string;
  showClock: string;
  linkedLabel: string;
  status: string;
  statusKind: "ok" | "error" | "";
  volume: number;
  showFullscreenEnabled: boolean;
  presenting: boolean;
};

export type StageToPlayerMessage =
  | { kind: "ready" }
  | { kind: "play"; currentTime: number }
  | { kind: "pause"; currentTime: number }
  | { kind: "seek"; currentTime: number }
  | { kind: "closed" }
  | { kind: "sync"; overlay: string }
  | { kind: "nudge"; delta: number }
  | { kind: "link" }
  | { kind: "linked" }
  | { kind: "volume"; volume: number }
  | { kind: "present"; mode: "reaction" | "show" | "exit" };

export type PlayerToStageMessage = StageInitMessage | StageHudState | { kind: "close" };
