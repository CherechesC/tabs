# Tab Wrangler

<img src="public/icons/icon.svg" width="80" alt="Tab Wrangler icon" />

**Your tabs, untangled.** A calmer browser starts here: find, organize, and untangle your tabs across every window.

Tab Wrangler is a local-first, Manifest V3 extension written in TypeScript for Chromium browsers, including Google Chrome and Microsoft Edge. Click its toolbar icon to open a dedicated dashboard tab. Click again to return to that dashboard instead of opening another one.

## Features

- **Every window, one place:** view open tabs grouped by browser window, with their native tab groups, names, colors, and collapsed-in-browser status.
- **Find your focus:** search titles and URLs with highlighted matches. Space-separated words all need to match, in any order.
- **Spot duplicates across windows:** filter duplicate tabs using three URL rules.
- **Take action:** switch to a tab or close it individually. Switching expands its native group when necessary. Closing a pinned tab asks for confirmation.
- **Stay up to date:** the dashboard responds to tab, window, and group changes without a manual reload.
- **Keep context:** pinned, active, and playing-audio tabs are labeled. Collapse dashboard sections independently of browser groups; searching reveals matches inside collapsed sections.
- **Keyboard friendly:** press `/` to search and `Escape` in the search field to clear it.

### Duplicate rules

| Rule | Matches | Example |
| --- | --- | --- |
| Same URL (default) | Full normalized URL, ignoring `#fragments`; query parameters remain significant | `/docs?q=1#intro` and `/docs?q=1#usage` |
| Same path | Same origin and path, ignoring query parameters, fragments, and trailing slashes | `/docs/?q=1` and `/docs?q=2` |
| Same site section | Same origin and complete first path segment | `/docs/api` and `/docs/guide` |

Origin includes the scheme, host, and port: different sites, subdomains, and HTTP/HTTPS are not merged. Path case remains significant. Only HTTP, HTTPS, and file URLs are considered; internal pages such as `edge://settings` and `chrome://newtab` are not duplicate candidates.

The duplicate count includes **all tabs** in matching sets, not just extra copies. It is calculated across the workspace before search/window filters. “Same site section” intentionally finds related pages, which are **not necessarily duplicates**. Nothing is automatically deleted.

## Setup

Use Node.js **22.12+ on the 22.x line** (or a supported 24.x/26+ release) and npm. An `.nvmrc` is included.

```sh
npm ci
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**, then choose this project's generated `dist` directory.
4. Pin **Tab Wrangler** in the extensions menu and click its icon.

### Load in Microsoft Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**, then choose the same `dist` directory.
4. Pin **Tab Wrangler** and click its icon.

After changing code, rebuild, click **Reload** on the browser's extension page, then reload the dashboard. Load `dist`, not the repository root. The extension does not replace your default new-tab page.

### Preview and development

```sh
npm run dev
```

Open the URL printed by Vite. Outside the extension, a prominently labeled **sample-data preview** lets you explore the interface without reading or modifying real browser tabs. Sample close actions are simulated and reset on page reload.

## Testing

```sh
npm run check                     # Strict typechecking, including tests and config
npm test                          # TypeScript unit tests with Vitest
npm run test:watch                # Unit tests in watch mode
npx playwright install chromium  # One-time browser installation
npm run test:e2e                  # Build + desktop/mobile UI + real extension tests
```

On Linux, use `npx playwright install --with-deps chromium` when system browser libraries are missing.

Unit tests cover URL normalization, duplicate rules, search, browser API adaptation, event cleanup, preview isolation, and toolbar behavior. Playwright covers responsive UI, filters, highlighting, closing, pinned-tab confirmation, group collapse, shortcuts, and a **real unpacked extension** in Chromium. The extension test verifies native groups, multiple windows, activation, live updates, closing, and rendering untrusted titles safely. It uses intercepted test pages, not external websites. One desktop-only window-navigation test is intentionally skipped in the mobile project.

The real-extension test uses Playwright's Chromium channel with a temporary persistent profile; it runs headlessly without Xvfb. Chrome/Edge branded browser releases may disallow command-line extension sideloading, so the automated suite uses bundled Chromium. To smoke-test Edge manually, create named/colored groups in two windows, collapse a group, then verify the dashboard, switching, searching, and closing.

## Privacy, permissions, and compatibility

- `tabs` reads titles, URLs, and tab state and enables tab actions.
- `tabGroups` reads native Chrome/Edge group metadata and expands a group when you switch to a tab.
- No host permissions, content scripts, remote scripts, analytics, backend, or account. Tab data stays in memory on your device; nothing is uploaded or persisted by Tab Wrangler.
- Site initials are rendered locally instead of fetching remote favicons.
- Only currently open normal/popup browser windows are included. Tab Wrangler's own dashboard tabs are excluded.
- Native groups are shown even when collapsed in the browser. Grouping is preserved; the extension does not reorganize your tabs.
- Edge Collections, Edge Workspaces, Chrome saved/closed tab groups, and other browser-specific features not exposed through Chromium's `tabs`/`tabGroups` APIs are not accessible. Groups are optional when the API is unavailable. Incognito access is disabled by default; only browser-exposed tabs can be managed.
- Closing tabs uses the browser's standard close operation. To recover a closed tab, use the browser's reopen-closed-tab command.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/main.ts`, `src/style.css` | Accessible, responsive dashboard |
| `src/model.ts` | Pure tab-search and duplicate-detection logic |
| `src/browser.ts` | Chromium API adapter and standalone preview |
| `src/background.ts` | Toolbar action and dashboard reuse |
| `public/manifest.json` | Manifest V3 permissions and entry points |
| `public/icons/` | Original SVG branding and raster extension icons |
| `src/*.test.ts` | Unit tests |
| `tests/` | Playwright UI and real-extension tests |

Vite builds both the dashboard and a standalone module service worker, copying the manifest and icons into `dist`. The extension has no runtime package dependencies.

## Continuous integration

GitHub Actions runs on pushes, pull requests, and manual dispatch. It installs from the lockfile, typechecks all TypeScript, runs unit tests, builds the extension, and runs Playwright. Successful runs publish the unpacked extension as the **tab-wrangler** artifact; Playwright reports and failure diagnostics are also uploaded. Extract the extension artifact before loading it as unpacked.

## License

[MIT](LICENSE).
