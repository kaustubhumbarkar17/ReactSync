export const STAGE_CHANNEL = "reaction-sync-stage";

export type StageInitMessage = {
  kind: "init";
  src: string;
  currentTime: number;
  paused: boolean;
  volume: number;
};

export type StageToPlayerMessage =
  | { kind: "ready" }
  | { kind: "play"; currentTime: number }
  | { kind: "pause"; currentTime: number }
  | { kind: "seek"; currentTime: number }
  | { kind: "closed" };

export type PlayerToStageMessage = StageInitMessage | { kind: "close" };
