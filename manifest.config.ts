import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Reaction Sync",
  version: "0.1.0",
  description:
    "Play a local reaction as the master clock and keep Netflix or JioHotstar on the overlay timestamp.",
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
  action: {
    default_title: "Reaction Sync",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
    },
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  permissions: ["storage", "tabs", "sidePanel"],
  host_permissions: [
    "*://www.netflix.com/*",
    "*://netflix.com/*",
    "*://www.hotstar.com/*",
    "*://hotstar.com/*",
    "*://www.jiohotstar.com/*",
    "*://jiohotstar.com/*",
    "http://127.0.0.1/*",
    "http://localhost/*",
  ],
  content_scripts: [
    {
      matches: ["*://www.netflix.com/*", "*://netflix.com/*"],
      js: ["src/content/netflix-isolated.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["*://www.netflix.com/*", "*://netflix.com/*"],
      js: ["src/content/netflix-main.ts"],
      world: "MAIN",
      run_at: "document_idle",
    },
    {
      matches: [
        "*://www.hotstar.com/*",
        "*://hotstar.com/*",
        "*://www.jiohotstar.com/*",
        "*://jiohotstar.com/*",
      ],
      js: ["src/content/hotstar.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["http://127.0.0.1/*", "http://localhost/*"],
      js: ["src/content/html5.ts"],
      run_at: "document_idle",
    },
  ],
});
