# CyberTab

A lightweight, privacy-friendly Chrome new tab extension with a cyberpunk theme. No login, no ads — add movable favorites as app-style tiles.

## Quick start

- Ensure you have turned on developer mode in the extensions page.
- Load unpacked extension in Chrome/Edge: open chrome://extensions ➜ "Load unpacked" ➜ select this project folder.
- The new tab page is overridden by [newtab.html](newtab.html).

## Features

- Customizable tiles with icons (local, fetched favicon, or generated).
- Search box with engine toggle and remote suggestions (via [background.js](background.js)).
- __Supported search engines: Google, Bing, Baidu.__
- __Supported system languages: English, Simplified Chinese, Japanese.__
- Sync top bookmarks into the grid and keep them in sync, you can customize the amount of bookmarks synced in settings.
- Custom background image and export/import settings.
- Tab key can quickly switch search engines.
- Right-click context menu for tiles (edit icon, delete).
- Right-click context menu for adding new tiles or switch on/off auto-align.
- __BREAKING CHANGE in v1.2.0: Twitter feed sidebar using Nitter instances. You can add accounts in the settings, and you'll see the news feed from those accounts in the sidebar.__

## Important files

- [manifest.json](manifest.json) — extension manifest and permissions.
- [newtab.html](newtab.html) — UI shell.
- [newtab.js](newtab.js) — main logic (tile management, UI, i18n).
- [background.js](background.js) — proxy for suggestion fetches.
- [style.css](style.css) — theme and layout.
