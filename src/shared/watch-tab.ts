import { isSupportedWatchUrl } from "./sites";

export type WatchTabLike = {
  url?: string;
  windowId?: number;
  lastAccessed?: number;
  active?: boolean;
};

export function pickWatchTab<T extends WatchTabLike>(
  tabs: T[],
  options: { stageWindowId?: number; lastFocusedNormalWindowId?: number } = {},
): T | undefined {
  const { stageWindowId, lastFocusedNormalWindowId } = options;
  if (lastFocusedNormalWindowId != null) {
    const active = tabs.find(
      (tab) =>
        tab.windowId === lastFocusedNormalWindowId &&
        tab.active &&
        tab.windowId !== stageWindowId &&
        isSupportedWatchUrl(tab.url),
    );
    if (active) return active;
  }

  return tabs
    .filter((tab) => tab.windowId !== stageWindowId && isSupportedWatchUrl(tab.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
}
