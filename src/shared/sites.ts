import type { SiteId } from "./messages";

const NETFLIX = /(?:^|\.)netflix\.com$/i;
const HOTSTAR = /(?:^|\.)(?:jio)?hotstar\.com$/i;
const PRIMEVIDEO = /(?:^|\.)primevideo\.com$/i;
const WATCH_AMAZON = /(?:^|\.)watch\.amazon\./i;
const AMAZON =
  /(?:^|\.)amazon\.(com|co\.uk|co\.jp|com\.au|com\.mx|com\.br|com\.tr|ae|ca|de|eg|es|fr|in|it|nl|pl|sa|se|sg|be)$/i;
const AMAZON_VIDEO_PATH = /\/gp\/video(?:\/|$)|\/amazon-video(?:\/|$)/i;
const LOCAL = /^(localhost|127\.0\.0\.1)$/i;

export function siteFromUrl(url: string | undefined): SiteId {
  if (!url) return "unknown";
  try {
    const { hostname, pathname } = new URL(url);
    if (NETFLIX.test(hostname)) return "netflix";
    if (HOTSTAR.test(hostname)) return "hotstar";
    if (isPrimeWatchPage(hostname, pathname)) return "prime";
    if (LOCAL.test(hostname)) return "mock";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function isPrimeWatchPage(hostname: string, pathname: string): boolean {
  if (PRIMEVIDEO.test(hostname) || WATCH_AMAZON.test(hostname)) return true;
  return AMAZON.test(hostname) && AMAZON_VIDEO_PATH.test(pathname);
}

export function siteLabel(site: SiteId): string {
  switch (site) {
    case "netflix":
      return "Netflix";
    case "hotstar":
      return "JioHotstar";
    case "prime":
      return "Prime Video";
    case "mock":
      return "Mock streamer";
    default:
      return "Unknown tab";
  }
}

export function isSupportedWatchUrl(url: string | undefined): boolean {
  const site = siteFromUrl(url);
  return site === "netflix" || site === "hotstar" || site === "prime" || site === "mock";
}

export const PRIME_MATCHES = [
  "*://*.primevideo.com/*",
  "*://primevideo.com/*",
  "*://watch.amazon.com/*",
  "*://*.amazon.com/gp/video/*",
  "*://amazon.com/gp/video/*",
  "*://*.amazon.co.uk/gp/video/*",
  "*://*.amazon.de/gp/video/*",
  "*://*.amazon.co.jp/gp/video/*",
  "*://*.amazon.in/gp/video/*",
  "*://*.amazon.ca/gp/video/*",
  "*://*.amazon.com.au/gp/video/*",
  "*://*.amazon.fr/gp/video/*",
  "*://*.amazon.it/gp/video/*",
  "*://*.amazon.es/gp/video/*",
  "*://*.amazon.com.mx/gp/video/*",
  "*://*.amazon.com.br/gp/video/*",
  "*://*.amazon.nl/gp/video/*",
  "*://*.amazon.sg/gp/video/*",
  "*://*.amazon.ae/gp/video/*",
  "*://*.amazon.sa/gp/video/*",
  "*://*.amazon.pl/gp/video/*",
  "*://*.amazon.se/gp/video/*",
  "*://*.amazon.com.tr/gp/video/*",
  "*://*.amazon.eg/gp/video/*",
  "*://*.amazon.be/gp/video/*",
];
