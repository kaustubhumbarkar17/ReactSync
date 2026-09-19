import type { SiteId } from "./messages";

const NETFLIX = /(?:^|\.)netflix\.com$/i;
const HOTSTAR = /(?:^|\.)(?:jio)?hotstar\.com$/i;
const LOCAL = /^(localhost|127\.0\.0\.1)$/i;

export function siteFromUrl(url: string | undefined): SiteId {
  if (!url) return "unknown";
  try {
    const { hostname } = new URL(url);
    if (NETFLIX.test(hostname)) return "netflix";
    if (HOTSTAR.test(hostname)) return "hotstar";
    if (LOCAL.test(hostname)) return "mock";
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function siteLabel(site: SiteId): string {
  switch (site) {
    case "netflix":
      return "Netflix";
    case "hotstar":
      return "JioHotstar";
    case "mock":
      return "Mock streamer";
    default:
      return "Unknown tab";
  }
}

export function isSupportedWatchUrl(url: string | undefined): boolean {
  const site = siteFromUrl(url);
  return site === "netflix" || site === "hotstar" || site === "mock";
}
