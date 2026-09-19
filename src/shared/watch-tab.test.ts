import { describe, expect, it } from "vitest";
import { pickWatchTab } from "./watch-tab";

describe("pickWatchTab", () => {
  const netflix = {
    url: "https://www.netflix.com/watch/1",
    windowId: 1,
    lastAccessed: 10,
    active: true,
  };
  const hotstar = {
    url: "https://www.hotstar.com/in/shows/x",
    windowId: 2,
    lastAccessed: 20,
    active: true,
  };
  const prime = {
    url: "https://www.primevideo.com/detail/0ABC",
    windowId: 3,
    lastAccessed: 30,
    active: true,
  };
  const amazonShop = {
    url: "https://www.amazon.com/dp/B09J6T2D3M",
    windowId: 4,
    lastAccessed: 40,
    active: true,
  };
  const stage = {
    url: "chrome-extension://id/src/stage/index.html",
    windowId: 99,
    lastAccessed: 50,
    active: true,
  };

  it("prefers the active tab in the last focused normal window", () => {
    expect(
      pickWatchTab([hotstar, netflix, stage], {
        stageWindowId: 99,
        lastFocusedNormalWindowId: 1,
      }),
    ).toBe(netflix);
  });

  it("ignores the reaction fullscreen window", () => {
    expect(pickWatchTab([stage, hotstar], { stageWindowId: 99 })).toBe(hotstar);
  });

  it("falls back to the most recently used watch tab", () => {
    expect(pickWatchTab([netflix, hotstar], { stageWindowId: 99 })).toBe(hotstar);
  });

  it("returns undefined when no watch tab exists", () => {
    expect(pickWatchTab([stage], { stageWindowId: 99 })).toBeUndefined();
  });

  it("picks Prime Video and ignores Amazon shopping tabs", () => {
    expect(pickWatchTab([amazonShop, prime, stage], { stageWindowId: 99 })).toBe(prime);
  });
});
