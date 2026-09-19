import type {
  LinkInfo,
  LinkReply,
  PlayerReply,
  RuntimeMessage,
  StageWindowBounds,
  WatchWindowReply,
  WatchWindowState,
} from "./shared/messages";
import { isSupportedWatchUrl, siteFromUrl } from "./shared/sites";
import { pickWatchTab } from "./shared/watch-tab";

const LINK_KEY = "linkedTab";
const WINDOW_STATE_KEY = "watchWindowPriorState";
const STAGE_WINDOW_KEY = "reactionStageWindowId";

type RestorableWindowState = "normal" | "maximized";

type StoredWindowState = {
  windowId: number;
  state: RestorableWindowState;
};

function restoreWindowState(prior: chrome.windows.WindowState | string | undefined): RestorableWindowState {
  if (prior === chrome.windows.WindowState.MAXIMIZED || prior === "maximized") return "maximized";
  return "normal";
}

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

async function findWatchTab(): Promise<chrome.tabs.Tab | undefined> {
  const stored = await chrome.storage.session.get(STAGE_WINDOW_KEY);
  const stageWindowId = stored[STAGE_WINDOW_KEY] as number | undefined;
  let lastFocusedNormalWindowId: number | undefined;
  try {
    const lastNormal = await chrome.windows.getLastFocused({
      windowTypes: ["normal"],
    });
    lastFocusedNormalWindowId = lastNormal.id;
  } catch {
    /* no normal browser window */
  }

  const tabs = await chrome.tabs.query({});
  return pickWatchTab(tabs, { stageWindowId, lastFocusedNormalWindowId });
}

async function setLink(tab: chrome.tabs.Tab): Promise<LinkReply> {
  if (tab.id == null || !tab.url) {
    return { ok: false, error: "That tab has no URL I can link." };
  }
  if (!isSupportedWatchUrl(tab.url)) {
    return {
      ok: false,
      error: "Open Netflix, JioHotstar, Prime Video, or the mock streamer, then link that tab.",
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

async function openReactionStage(bounds?: StageWindowBounds): Promise<WatchWindowReply> {
  const stored = await chrome.storage.session.get(STAGE_WINDOW_KEY);
  const existingId = stored[STAGE_WINDOW_KEY] as number | undefined;
  if (existingId != null) {
    try {
      await fillWindow(existingId, bounds);
      return { ok: true };
    } catch {
      await chrome.storage.session.remove(STAGE_WINDOW_KEY);
    }
  }

  try {
    const createData: chrome.windows.CreateData = {
      url: chrome.runtime.getURL("src/stage/index.html"),
      type: "popup",
      focused: true,
    };
    if (bounds && bounds.width > 100 && bounds.height > 100) {
      createData.left = Math.round(bounds.left);
      createData.top = Math.round(bounds.top);
      createData.width = Math.round(bounds.width);
      createData.height = Math.round(bounds.height);
    } else {
      createData.state = "fullscreen";
    }

    const win = await chrome.windows.create(createData);
    const windowId = win?.id;
    if (windowId == null) {
      return { ok: false, error: "Could not open the reaction fullscreen window." };
    }
    await chrome.storage.session.set({ [STAGE_WINDOW_KEY]: windowId });
    await fillWindow(windowId, bounds);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not open the reaction fullscreen window." };
  }
}

async function fillWindow(windowId: number, bounds?: StageWindowBounds): Promise<void> {
  if (bounds && bounds.width > 100 && bounds.height > 100) {
    await chrome.windows.update(windowId, {
      focused: true,
      left: Math.round(bounds.left),
      top: Math.round(bounds.top),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }
  try {
    await chrome.windows.update(windowId, { state: "fullscreen", focused: true });
  } catch {
    try {
      await chrome.windows.update(windowId, { state: "maximized", focused: true });
    } catch {
      /* window is already as large as we could make it */
    }
  }
}

async function closeReactionStage(): Promise<WatchWindowReply> {
  const stored = await chrome.storage.session.get(STAGE_WINDOW_KEY);
  const existingId = stored[STAGE_WINDOW_KEY] as number | undefined;
  await chrome.storage.session.remove(STAGE_WINDOW_KEY);
  if (existingId == null) return { ok: true };
  try {
    await chrome.windows.remove(existingId);
  } catch {
    /* already closed */
  }
  return { ok: true };
}

async function setWatchWindow(state: WatchWindowState): Promise<WatchWindowReply> {
  const link = await getLink();
  if (!link) {
    return { ok: false, error: "Link a Netflix, JioHotstar, or Prime Video tab first." };
  }

  try {
    const tab = await chrome.tabs.get(link.tabId);
    if (tab.windowId == null) {
      return { ok: false, error: "Could not find the watch window." };
    }

    if (state === "fullscreen") {
      const win = await chrome.windows.get(tab.windowId);
      const prior: StoredWindowState = {
        windowId: tab.windowId,
        state: restoreWindowState(win.state),
      };
      await chrome.storage.session.set({ [WINDOW_STATE_KEY]: prior });
      await chrome.windows.update(tab.windowId, { state: "fullscreen", focused: true });
      return { ok: true };
    }

    const stored = await chrome.storage.session.get(WINDOW_STATE_KEY);
    const prior = stored[WINDOW_STATE_KEY] as StoredWindowState | undefined;
    const nextState =
      prior?.windowId === tab.windowId ? restoreWindowState(prior.state) : "normal";
    await chrome.windows.update(tab.windowId, { state: nextState, focused: true });
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not change the watch window. Relink the tab." };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.kind === "LINK_ACTIVE_TAB") {
    void findWatchTab().then(async (tab) => {
      if (!tab) {
        sendResponse({
          ok: false,
          error: "Open Netflix, JioHotstar, or Prime Video in a browser tab, then press Link tab again.",
        } satisfies LinkReply);
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

  if (message.kind === "SET_WATCH_WINDOW") {
    void setWatchWindow(message.state).then(sendResponse);
    return true;
  }

  if (message.kind === "OPEN_REACTION_STAGE") {
    void openReactionStage(message.bounds).then(sendResponse);
    return true;
  }

  if (message.kind === "CLOSE_REACTION_STAGE") {
    void closeReactionStage().then(sendResponse);
    return true;
  }

  if (message.kind === "TO_PLAYER") {
    void getLink().then(async (link) => {
      if (!link) {
        sendResponse({ ok: false, error: "Link a Netflix, JioHotstar, or Prime Video tab first." } satisfies PlayerReply);
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

chrome.windows.onRemoved.addListener((windowId) => {
  void chrome.storage.session.get(STAGE_WINDOW_KEY).then((stored) => {
    if (stored[STAGE_WINDOW_KEY] === windowId) {
      void chrome.storage.session.remove(STAGE_WINDOW_KEY);
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void getLink().then((link) => {
    if (link?.tabId === tabId) {
      void chrome.storage.session.remove(LINK_KEY);
    }
  });
});
