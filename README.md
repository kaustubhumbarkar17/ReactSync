# Reaction Sync

Keep a local reaction video lined up with the show you already pay for.

Reaction and watch-along videos burn a show clock on screen. This Chrome/Edge extension plays that local reaction as the **master clock**. You type the overlay time (or press Sync), and Netflix, JioHotstar, or Prime Video jumps to match. After that, play, pause, and scrub on the reaction move the streaming tab.

A normal website cannot do this. Netflix blocks `video.currentTime` writes (error M7375). The extension drives Netflix through its unofficial page player API, and JioHotstar and Prime Video through the content `<video>` element.

## Use it against a real streamer

1. Install dependencies and build:

   ```bash
   npm install
   npm test
   npm run build
   ```

2. In Chrome or Edge, open `chrome://extensions`, turn on **Developer mode**, and click **Load unpacked**. Choose the `dist/` folder.

3. Open a title on [Netflix](https://www.netflix.com), [JioHotstar](https://www.jiohotstar.com), or [Prime Video](https://www.primevideo.com) and start playback once so the player exists.

4. Click the Reaction Sync icon. The side panel opens.

5. **Load reaction** (your downloaded reaction file).

6. Click **Link tab** while the watch tab is focused.

7. Type the overlay timestamp you see on the reaction (`1:23` or `1:23:45`) and press **Sync**.

8. Play or scrub the reaction. The show should follow. Use ±0.1s / ±1s if the lock is a hair off.

If the reactor pauses or rewinds, the overlay freezes and the single offset goes stale. Type the new overlay time and Sync again.

## Try it without Netflix

```bash
npm install
npm run demo
```

Open the printed local URL. That preview is the same player UI talking to a mock streamer tab over `BroadcastChannel`. Use **Use sample clip** if you do not have a reaction file handy. Both demo clips are local files with burned-in clocks, so the lock does not depend on YouTube or a CDN.

## What works, and what breaks

| Surface | How it is driven |
|---|---|
| Local reaction | File picker + blob URL in the side panel |
| Netflix | MAIN-world `netflix.appContext...videoPlayer` `play` / `pause` / `seek(ms)` |
| JioHotstar | `#video-container video` — never the ad player |
| Prime Video | `.rendererContainer video` (and the DV web player) — skip ad nodes |
| Mock streamer | Same HTML5 path as Hotstar, plus a demo BroadcastChannel |

Known limits:

- Netflix's player API is unofficial. A site rewrite can break seeks until the adapter is patched.
- Ads, recap prompts, and quality changes can replace the video node. Adapters re-bind, but you may need to Link tab again.
- Region intros and credit skips are not mapped. Nudge or re-sync.
- This repo cannot log into Netflix, Hotstar, or Prime Video for you. Confirm those on your own account after loading `dist/`.

## Scripts

| Command | What it does |
|---|---|
| `npm run demo` | Local preview of the player + mock streamer |
| `npm run build` | Unpacked Chrome extension in `dist/` |
| `npm test` | Timestamp parsing and offset math |
| `npm run dev` | Extension workbench (CRXJS + Vite) |

## Privacy

Videos stay on your machine. The extension does not upload files and has no backend. It only asks for tab access so it can talk to the watch page you link.
# ReactSync
