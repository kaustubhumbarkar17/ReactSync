import { NETFLIX_CMD, NETFLIX_RES, type PlayerReply, type RuntimeMessage } from "../shared/messages";

function sendToPage(command: { type: string; seconds?: number }): Promise<PlayerReply> {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener(NETFLIX_RES, onResult);
      resolve({ ok: false, error: "Netflix did not answer. Is a title actually playing?" });
    }, 2000);

    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string } & PlayerReply>).detail;
      if (!detail || detail.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener(NETFLIX_RES, onResult);
      const reply = { ...detail };
      delete (reply as { id?: string }).id;
      resolve(reply);
    };

    window.addEventListener(NETFLIX_RES, onResult);
    window.dispatchEvent(
      new CustomEvent(NETFLIX_CMD, {
        detail: { id, type: command.type, seconds: command.seconds },
      }),
    );
  });
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.kind !== "TO_PLAYER") return;
  void sendToPage(message.command).then(sendResponse);
  return true;
});
