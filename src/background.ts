import type { LinkInfo, LinkReply, PlayerReply, RuntimeMessage } from "./shared/messages";
import { isSupportedWatchUrl, siteFromUrl } from "./shared/sites";

const LINK_KEY = "linkedTab";

async function getLink(): Promise<LinkInfo | null> {
  const stored = await chrome.storage.session.get(LINK_KEY);
  const link = stored[LINK_KEY] as LinkInfo | undefined;
  if (!link) return null;
  try {
    const tab = await chrome.tabs.get(link.tabId);
    return {
      ...link,
      title: tab.title ?? link.title,
      url: tab.url ?? link.url,
    };
  } catch {
    await chrome.storage.session.remove(LINK_KEY);
    return null;
  }
}

async function setLink(tab: chrome.tabs.Tab): Promise<LinkReply> {
  if (tab.id == null || !tab.url) {
    return { ok: false, error: "That tab has no URL I can link." };
  }
  if (!isSupportedWatchUrl(tab.url)) {
    return {
      ok: false,
      error: "Open Netflix, JioHotstar, or the mock streamer, then link that tab.",
    };
  }

  const ping = await sendToTab(tab.id, { type: "PING" });
  if (!ping.ok) {
    return {
      ok: false,
      error: ping.error || "The page script is not answering. Reload the watch tab.",
    };
  }

  const link: LinkInfo = {
    tabId: tab.id,
    site: ping.ok ? ping.site : siteFromUrl(tab.url),
    title: tab.title ?? "Watch tab",
    url: tab.url,
  };
  await chrome.storage.session.set({ [LINK_KEY]: link });
  return { ok: true, link };
}

function sendToTab(tabId: number, command: { type: string; seconds?: number }): Promise<PlayerReply> {
  return chrome.tabs.sendMessage(tabId, { kind: "TO_PLAYER", command }).catch(() => ({
    ok: false,
    error: "Could not reach the watch tab. Reload it and link again.",
  }));
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.kind === "LINK_ACTIVE_TAB") {
    void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(async (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ ok: false, error: "No active tab to link." } satisfies LinkReply);
        return;
      }
      sendResponse(await setLink(tab));
    });
    return true;
  }

  if (message.kind === "GET_LINK") {
    void getLink().then((link) => {
      sendResponse(link ? ({ ok: true, link } satisfies LinkReply) : ({ ok: false, error: "No tab linked yet." } satisfies LinkReply));
    });
    return true;
  }

  if (message.kind === "CLEAR_LINK") {
    void chrome.storage.session.remove(LINK_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.kind === "TO_PLAYER") {
    void getLink().then(async (link) => {
      if (!link) {
        sendResponse({ ok: false, error: "Link a Netflix or JioHotstar tab first." } satisfies PlayerReply);
        return;
      }
      sendResponse(await sendToTab(link.tabId, message.command));
    });
    return true;
  }

  if (message.kind === "PLAYER_EVENT" && sender.tab?.id != null) {
    void getLink().then((link) => {
      if (link && link.tabId === sender.tab?.id) {
        void chrome.runtime.sendMessage({
          kind: "FROM_PLAYER",
          reply: message.reply,
        } satisfies RuntimeMessage).catch(() => {
          /* side panel closed */
        });
      }
    });
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void getLink().then((link) => {
    if (link?.tabId === tabId) {
      void chrome.storage.session.remove(LINK_KEY);
    }
  });
});
