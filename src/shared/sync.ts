export type SyncLock = {
  offsetSeconds: number;
  lockedAtReaction: number;
  lockedAtShow: number;
};

export function lockSync(reactionTime: number, overlayShowTime: number): SyncLock {
  return {
    offsetSeconds: overlayShowTime - reactionTime,
    lockedAtReaction: reactionTime,
    lockedAtShow: overlayShowTime,
  };
}

export function showTimeFor(reactionTime: number, lock: SyncLock): number {
  return Math.max(0, reactionTime + lock.offsetSeconds);
}

export function nudgeLock(lock: SyncLock, deltaSeconds: number): SyncLock {
  return {
    ...lock,
    offsetSeconds: lock.offsetSeconds + deltaSeconds,
    lockedAtShow: Math.max(0, lock.lockedAtShow + deltaSeconds),
  };
}

export function driftSeconds(actualShowTime: number, expectedShowTime: number): number {
  return actualShowTime - expectedShowTime;
}

export const DRIFT_SEEK_THRESHOLD = 0.4;
export const DRIFT_POLL_MS = 500;
