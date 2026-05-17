# Get Back To Work

A Chrome extension that redirects you from distraction sites to a "get back to work" reminder page. You configure which sites trigger the redirect and (optionally) where each one redirects to.

## Features

- Block any list of sites using Chrome match patterns (e.g. `*://*.reddit.com/*`)
- Built-in reminder page with a customizable message and "today's focus" note
- Per-rule custom redirect URL (e.g. send yourself to your Notion task list instead of the built-in page)
- "Continue anyway" button on the reminder page with a configurable delay (default 10s) that grants a 60-second grace window for that tab
- Settings sync across Chrome instances signed into the same Google account (via `chrome.storage.sync`)

## Install (unpacked, takes ~30 seconds)

1. Open Chrome and go to `chrome://extensions`.
2. Toggle **Developer mode** on (top-right corner).
3. Click **Load unpacked**.
4. Select this folder (the one containing `manifest.json`).
5. The extension should now appear in your toolbar.

> Note: this build does not include icon PNGs. Chrome will load fine without them, but if you want a toolbar icon, drop `icon16.png`, `icon48.png`, and `icon128.png` into an `icons/` folder next to `manifest.json`. Or remove the `icons` block from `manifest.json` to silence the warning.

## Configure

Click the extension's icon, or right-click it → **Options**, or go to `chrome://extensions` → find the extension → **Details** → **Extension options**.

In the settings page you can:

- **Reminder** — set the big headline message and an optional "today's focus" note shown on the reminder page.
- **Delay** — how many seconds the "Continue anyway" button is disabled (default 10).
- **Blocked sites** — add as many rules as you want. Each rule has:
  - **Pattern** — a [Chrome match pattern](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), e.g.
    - `*://*.reddit.com/*` — all of reddit including subdomains
    - `*://twitter.com/*` — twitter.com only
    - `*://*.youtube.com/*` — all of YouTube
    - `*://news.ycombinator.com/*` — Hacker News
  - **Redirect to** — optional. If filled, the tab is sent there instead of the built-in reminder page. Examples:
    - `https://www.notion.so/your-task-page`
    - A local file URL
    - Another tab in your todo app

Click **Save**. Changes take effect on the next navigation.

## How "Continue anyway" works

When you hit a blocked site, the tab redirects to the reminder page. The button is disabled and counts down (10s by default). After it enables and you click it, the extension grants a 60-second grace window for that tab so you can use the site without being immediately re-blocked. Open a new tab to the same site after the grace window and it'll redirect again.

## Files

```
manifest.json     # MV3 manifest
background.js     # service worker — intercepts navigation, matches patterns
blocked.html/.js/.css   # built-in reminder page
options.html/.js/.css   # settings tab
icons/            # (optional) toolbar icons
```

## Troubleshooting

- **Nothing happens when I visit a blocked site.** Reload the extension at `chrome://extensions` (click the refresh icon on its card). Service workers can go to sleep; reloading wakes everything up. Also re-check your pattern — `reddit.com` alone is not a valid match pattern; it needs a scheme and path, e.g. `*://*.reddit.com/*`.
- **It blocks too aggressively / not enough.** Tweak your patterns. `*://*.example.com/*` covers `example.com` and all subdomains; `*://example.com/*` is exact host only.
- **I want to disable it temporarily.** Toggle the extension off at `chrome://extensions`, or remove all rules and hit Save.

## Privacy

The extension stores your settings in `chrome.storage.sync` (synced to your Google account if you're signed in, otherwise local). It does not send any data anywhere. It only inspects URLs locally inside the service worker to decide whether to redirect.
