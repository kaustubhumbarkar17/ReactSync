import { describe, expect, it } from "vitest";
import { isSupportedWatchUrl, siteFromUrl, siteLabel } from "./sites";

describe("siteFromUrl", () => {
  it("recognizes Netflix, JioHotstar, and the mock streamer", () => {
    expect(siteFromUrl("https://www.netflix.com/watch/1")).toBe("netflix");
    expect(siteFromUrl("https://www.jiohotstar.com/in/shows/x")).toBe("hotstar");
    expect(siteFromUrl("http://127.0.0.1:43173/mock-streamer/")).toBe("mock");
  });

  it("recognizes Prime Video hosts and Amazon video paths", () => {
    expect(siteFromUrl("https://www.primevideo.com/detail/0ABC")).toBe("prime");
    expect(siteFromUrl("https://www.primevideo.com/region/eu/detail/0ABC")).toBe("prime");
    expect(siteFromUrl("https://www.amazon.com/gp/video/detail/B09J6T2D3M")).toBe("prime");
    expect(siteFromUrl("https://www.amazon.co.uk/gp/video/detail/B09J6T2D3M")).toBe("prime");
    expect(siteFromUrl("https://www.amazon.in/Amazon-Video/b?ie=UTF8")).toBe("prime");
    expect(siteFromUrl("https://watch.amazon.com/watch?asin=B09J6T2D3M")).toBe("prime");
  });

  it("does not treat Amazon shopping or music as a watch tab", () => {
    expect(siteFromUrl("https://www.amazon.com/dp/B09J6T2D3M")).toBe("unknown");
    expect(siteFromUrl("https://www.amazon.com/gp/cart/view.html")).toBe("unknown");
    expect(siteFromUrl("https://music.amazon.com/tracks/B001")).toBe("unknown");
  });
});

describe("isSupportedWatchUrl", () => {
  it("accepts Prime Video and rejects Amazon storefronts", () => {
    expect(isSupportedWatchUrl("https://www.primevideo.com/detail/0ABC")).toBe(true);
    expect(isSupportedWatchUrl("https://www.amazon.com/gp/video/detail/B0X")).toBe(true);
    expect(isSupportedWatchUrl("https://www.amazon.com/dp/B0X")).toBe(false);
  });
});

describe("siteLabel", () => {
  it("names Prime Video", () => {
    expect(siteLabel("prime")).toBe("Prime Video");
  });
});
