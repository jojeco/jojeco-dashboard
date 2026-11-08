# UI/UX Code Review — `dash.jojeco.ca/v4` (`redesign-v5`)

## 1. Executive Summary

- **Strong core, uneven finish:** `HomePageV5`, `ServicesPage`, `MediaPage`, `ControlsPage`, and `GamingPage` nail the dark GitHub-ops aesthetic (`#0d1117` / `#161b22` / Geist Mono), whereas `KioskPage`, `ToolsPage`, `PrinterPage`, `JobsPage`, and `JarvisPage` look unfinished or unported—leaking `border-white/*` light borders, Lucide spinners, `alert()` popups, and hardcoded colors.
- **Home (`HomePageV5`) has layout & visibility regressions:** `.v5-col` uses `display: flex` with `grid-template-rows` (a CSS no-op) and `overflow: hidden` without internal scroll regions, clipping bottom hosts/drives on 13"–15" laptops, while a pre-filter bug in `HomePageV5.tsx:42` completely hides personal GPU rigs (`JoPc`, `MacBook`, `AinsPC`).
- **Major "full control panel" gaps despite ready backend APIs:** Operators cannot start stopped Docker containers (`?all=0` hides them), prune Docker, pause/resume/delete/add torrents, toggle Tdarr GPU nodes, adjust room AC, stop remote Claude on S1/S3, or edit filament spool weights—even though `server/routes/*` already implements every one of those endpoints.
- **Mobile & iPhone UX blockers undermine mobile-first intent:** `JarvisPage` hardcodes `audio/webm` (throws on iOS Safari), `<16px` inputs trigger iOS viewport zoom on focus, hardcoded `http://192.168.50.13:3001/api` fallbacks fail over remote HTTPS, `KioskPage` & `PrinterPage` overflow narrow screens, and `/v4/jarvis` + `/v4/kiosk` are unreachable from navigation.
- **Accessibility, render-perf, and dead-code debt hurt polish:** Interactive controls routinely miss the 44px touch-target floor (down to `13×13px`) and WCAG AA contrast (`2.57:1`–`3.65:1`), `GamingPage` schedules `setTimeout` inside render, `ControlsPage` + `MediaPage` mount duplicate mobile/desktop DOM trees, and 5 dead component files (799 LOC) remain in `src/v4/components/`.

---

## 2. Top 10 Highest-Impact Issues (Ranked)

### 1. Broken `HomePageV5` "Viewport-Locked" Grid, Clipped Panels, and Global `<main>` Overflow Side-Effect
- **Where:** `src/v4/v4.css:365-370, 390-449`, `src/v4/components/AppShell.tsx:342`, `src/v4/components/HostTileD.tsx:554`, `src/v4/components/ServiceHealthSummary.tsx:30`, `src/v4/components/StoragePanel.tsx:201`
- **What's wrong:**
  1. `.v5-col` (`v4.css:365-370`) declares `display: flex; flex-direction: column`, yet `v4.css:417` and `v4.css:427` set `grid-template-rows: 62fr 38fr` and `grid-template-rows: 42fr 58fr` on `.v5-col > *` / `.v5-col-left` / `.v5-col-right`—a complete CSS no-op on flex containers. Instead, `.v5-col .v5-panel { flex: 1 1 0; overflow: hidden }` (`v4.css:432-435`) forces an unintended 50/50 vertical split.
  2. Unlike `LiveDownloadsPanel` (`LiveDownloadsPanel.tsx:241`), neither `HostTileDPanel`, `ServiceHealthSummary`, `GamingGlance`, nor `StoragePanel` has an internal `min-h-0 flex-1 overflow-y-auto` scroll body. On 1280×800 or 1440×900 desktop viewports, `.v5-panel { overflow: hidden }` hard-clips bottom hosts and storage pools with no scrollbar.
  3. `.v5-root` (`AppShell.tsx:332`) wraps **every** `/v4/*` page, so `@media (min-width: 1280px) { .v5-root main { overflow: hidden } }` (`v4.css:401-405`) leaks onto `ServicesPage`, `MediaPage`, `ControlsPage`, etc.—only letting pages scroll if the document root grows because `.v5-root` uses `min-h-[100dvh]` instead of locking height exclusively on `/v4`.
- **Concrete fix:**
  - Scope viewport-lock exclusively to Home (e.g., pass a `viewportLocked` prop or `.v5-home-main` class on `/v4` only: `xl:h-[calc(100dvh-44px)] xl:overflow-hidden`), removing `.v5-root main { overflow: hidden }` for standard scrolling subpages.
  - Change `.v5-col` at `>=1280px` from `display: flex` to `display: grid; min-height: 0;` so `grid-template-rows: 62fr 38fr` (left) and `42fr 58fr` (right) actually take effect, and remove `flex: 1 1 0` from `.v5-col .v5-panel`.
  - Give `HostTileDPanel`, `ServiceHealthSummary`, and `StoragePanel` `flex flex-col min-h-0 h-full` outer shells and `flex-1 min-h-0 overflow-y-auto` list bodies so overflow scrolls cleanly inside each console surface.

### 2. Stopped Docker Containers Are Permanently Invisible & Unstartable (`?all=0`), Plus Missing Container Actions in Service Modal & No Prune Button
- **Where:** `src/v4/pages/ServicesPage.tsx:91-253, 646, 683-688, 753`, `server/routes/docker.js:14-15, 53`
- **What's wrong:**
  1. `ServicesPage.tsx:753` polls `${API_URL}/docker/containers?all=0`. In `server/routes/docker.js:14-15`, `all=0` filters to running containers only (`docker ps` without `-a`). Consequently, `stopped` (`ServicesPage.tsx:646`) is **always `0`**, the `+0 stopped` toggle (`ServicesPage.tsx:686`) is dead UI, and if any container crashes or is stopped via the Stop button (`ServicesPage.tsx:528`), **it vanishes from the UI and can never be started again without SSH**.
  2. Clicking a Lab Service row opens `ServiceDetailBody` (`ServicesPage.tsx:91-253`), which resolves `matchedContainer` and renders `<ContainerLogTail>`, **but omits `<ContainerActions>`**—forcing the user to close the modal, scroll down to the 54-container inventory, search by name, and open a second modal just to restart that service.
  3. `server/routes/docker.js:53` exposes `POST /api/docker/prune`, and `KioskPage.tsx:283` explicitly tells the operator *"run docker system prune"* when LVM hits 70%, yet neither `ServicesPage` nor `ControlsPage` has a Prune button.
- **Concrete fix:**
  - Change `ServicesPage.tsx:753` to fetch `/docker/containers?all=1`; keep running containers visible by default (`showStopped === false`) while letting the existing `+N stopped` toggle reveal exited containers with a prominent **Start** button (`onAction(..., 'start')`).
  - Render `<ContainerActions container={matchedContainer} busy={busy} onAction={onContainerAction} />` directly inside `ServiceDetailBody` (`ServicesPage.tsx:222`) whenever `matchedContainer` is present.
  - Add a confirmation-gated **Prune Unused Images** button wired to `POST /api/docker/prune` in the `ContainerSummary` header (`ServicesPage.tsx:673`) or `ControlsPage`.

### 3. Major Control-Panel Action Gaps Across Media, Climate, Printer, and Remote Claude (Backend Routes Already Exist)
- **Where:** `src/v4/pages/MediaPage.tsx:298-355, 594-767, 1294-1409`, `src/v4/components/LiveDownloadsPanel.tsx:197-287`, `src/v4/components/AppShell.tsx:39-65`, `src/v4/pages/PrinterPage.tsx:277-310`, `src/v4/pages/ControlsPage.tsx:807-914`
- **What's wrong:** Violates the core mandate that *"every manual admin action should have a button"*, even though the Express backend already exposes authenticated endpoints for all of these:
  1. **qBittorrent & SABnzbd (`MediaPage.tsx:298-355`, `LiveDownloadsPanel.tsx:197-287`):** `server/routes/torrents.js:54-81` implements `POST /api/torrents/add` (magnet/URL) and `POST /api/torrents/:action` (`pause`, `resume`, `delete`, `recheck`), yet `TorrentDetailModal` and `DownloadsPanel` are 100% read-only.
  2. **Tdarr GPU Worker Nodes (`MediaPage.tsx:1294-1409`):** `server/routes/controls.js:111` implements `POST /api/controls/tdarr/:node/:action` (`jopc`/`ainspc`, `enable`/`disable`), yet `TdarrStrip` only displays passive badges.
  3. **Room AC Climate (`AppShell.tsx:39-65`):** `AcTemps` polls `/api/ac/status`, and `server/routes/ac.js:31-50` implements `POST /api/ac/power`, `/api/ac/temperature` (17–30°C), and `/api/ac/mode`—yet `AcTemps` is non-interactive text and legacy `/home` (HomeAssistant) was never ported to v4.
  4. **Filament Spool Inventory (`PrinterPage.tsx:277-310`):** `server/server.js:1650` implements `POST /api/filament/:id/update` (`weight_remaining_g`, `status`, `color_name`, `sku`), yet clicking a spool only opens a static 128px color swatch modal with zero edit controls.
  5. **Remote Claude Lifecycle (`ControlsPage.tsx:862-910`):** `ControlsPage` has buttons to start Claude on S3/S1 (`claude-server3`, `claude-server1`) and `server/routes/controls.js:223-249` supports `POST /api/controls/claude/:machine/stop|restart` for any machine, yet `ClaudePanel` hardcodes Stop/Restart to `ct100` only and hardcodes a nominal green left stripe (`ControlsPage.tsx:823`) even when `lab.claudeRunning` (`useSnapshot.tsx:121`) is `false`.
- **Concrete fix:**
  - Add **Pause / Resume / Recheck / Delete (with delete-files checkbox)** buttons to `TorrentDetailModal` (`MediaPage.tsx:350`) + an **+ Add Magnet** modal button in `DownloadsPanel` (`MediaPage.tsx:662`).
  - Add inline **Enable / Disable GPU Worker** toggles per node in `TdarrStrip` (`MediaPage.tsx:1360`) calling `POST /api/controls/tdarr/:node/:action`.
  - Turn `AcTemps` (`AppShell.tsx:58`) into a button (also visible in mobile header/sheet) opening a compact `DetailModal` with Power toggle, Mode pills, and `− / +` target temperature steppers wired to `/api/ac/*`.
  - Replace the static color-preview modal in `PrinterPage.tsx:277-310` with an editable spool sheet (`weight_remaining_g` quick `-50g / -100g / Mark Empty` buttons + status selector) posting to `/api/filament/:id/update`.
  - Parameterize `ClaudePanel` Stop/Restart across `ct100 | server1 | server3` and drive its left status stripe from `lab?.claudeRunning`.

### 4. `KioskPage` Proclaims False-Green `"HEALTHY"` When Offline/Unauthenticated, Breaks Mobile Layout, and Uses Legacy Design Tokens
- **Where:** `src/v4/pages/KioskPage.tsx:58, 106, 265-404, 518, 527-542, 639`
- **What's wrong:**
  1. **Dangerous false-nominal lie (`KioskPage.tsx:518`):** `const overallStatus = data.lab?.status ?? 'healthy';` defaults missing/failed telemetry to `'healthy'`. Because `/v4/kiosk` runs outside `V4ProtectedRoute` (`V4Router.tsx:146`) while `/api/docker/containers`, `/api/lvm`, etc. require auth or fail when offline, the top status bar renders bright green **HEALTHY** while cards below say `Unable to load` or spin `Loading…` forever (`LvmCard:272`, `LiteLLMCard:307`, `UptimeKumaCard:335`, `GrafanaAlertsCard:403` never distinguish fetch error `null` from initial loading!).
  2. **Broken responsiveness (`KioskPage.tsx:639, 147`):** Inline `gridTemplateColumns: 'repeat(4, 1fr)'` with `span={2}` and zero breakpoints causes severe horizontal text overflow on phones/tablets (visible in `screenshots/kiosk.png`).
  3. **Design-system & border violations (`KioskPage.tsx:527-542, 106, 599`):** Uses `#080810`/`#0f0f18`, legacy teal `#14b8a6`, light borders `1px solid rgba(255,255,255,0.07)` on every card, `kSpin` spinning `<RefreshCw>` icons, generic `monospace` instead of Geist Mono, 6 independent 30s REST polls instead of `useSnapshot`, and broken math in `UptimeKumaCard` (`KioskPage.tsx:350`: `(data.down / data.total) * 100 > 0 ? 100 : 0` forces red fault text even when status is `'warn'`).
- **Concrete fix:**
  - Rebuild `KioskPage` on `--v4-*` tokens (`--v4-void`, `--v4-console`, inset 2px status stripes, zero `1px solid rgba(255,255,255,0.07)` borders, `Skeleton` shimmer instead of `kSpin`), backed by `useSnapshot` where available.
  - Compute `overallStatus` as `'loading'` before first fetch, `'unknown'`/`'degraded'` (`--v4-degraded` `"TELEMETRY DEGRADED"`) if any endpoint returns `null`/error, and `'healthy'` **only** when `data.lab` and card payloads succeed.
  - Replace inline `repeat(4, 1fr)` with responsive Tailwind grid classes `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` and `md:col-span-2`.

### 5. `HomePageV5` Pre-Filters Personal Rigs Before Passing Machines to `HostTileDPanel`, Hiding `JoPc`, `MacBook`, and `AinsPC`
- **Where:** `src/v4/pages/HomePageV5.tsx:16, 42, 58-62`, `src/v4/components/HostTileD.tsx:504-505`
- **What's wrong:** `HomePageV5.tsx:42` filters out `PERSONAL_IDS = new Set(['jopc', 'macbook', 'jomac', 'ainspc'])` to produce `labMachines`, and then passes `machines={labMachines}` **plus** `secondaryIds={PERSONAL_IDS}` into `<HostTileDPanel>` (`HomePageV5.tsx:59-60`). Inside `HostTileDPanel` (`HostTileD.tsx:505`), `const secondary = machines.filter(m => secondaryIds?.has(m.id))` always evaluates to `[]` because those IDs were already stripped! As a result, Jordan's GPU/AI rigs (`JoPc` running Ollama/Tdarr, `MacBook`/`JoMac`, `AinsPC`) completely vanish from Hosts while simultaneously appearing right next door in `StoragePanel` (`StoragePanel.tsx:188`).
- **Concrete fix:**
  - In `HomePageV5.tsx:59`, pass the unfiltered `machines` array (`machines={machines}`) to `<HostTileDPanel machines={machines} secondaryIds={PERSONAL_IDS} onSelect={setSelectedHost} />` and delete the dead `labMachines` filter at line 42 so `HostTileDPanel`'s built-in `personal rigs` divider (`HostTileD.tsx:582-598`) renders as designed.

### 6. Violations of the "No Light Borders" Law, Banned Spinners/Purple/Glows, and the `--v4-amber` Naming Trap
- **Where:** `src/v4/pages/PrinterPage.tsx:181, 187, 255`, `src/v4/pages/ToolsPage.tsx:99, 111, 117, 154, 158, 179`, `src/v4/pages/KioskPage.tsx:106, 530, 599`, `src/v4/pages/MediaPage.tsx:210, 396, 1082, 1245`, `src/v4/pages/GamingPage.tsx:387-388`, `tailwind.config.js:62`
- **What's wrong:**
  1. **Direct light-border violations (`DESIGN.md §4/§7` owner veto):** `border-white/5`, `border-white/10`, and `hover:border-[var(--v4-signal)]` / `focus:border-[var(--v4-signal)]` (`#e6edf3` near-white outline!) appear in `PrinterPage.tsx:181,187`, `ToolsPage.tsx:99,117,154,179`, and `KioskPage.tsx:106,530,599`; `HostTileD.tsx:557` & `GamingGlance.tsx:82` add top light bevels `inset 0 1px 0 rgba(255,255,255,0.03)`; and action buttons/badges across `ControlsPage`, `GamingPage`, `ServicesPage`, and `UpdatesPanel` use translucent `1px solid rgba(...)` outlines instead of borderless tonal fills.
  2. **`--v4-amber` token trap (`v4.css:24`, `tailwind.config.js:62`):** `--v4-amber` was remapped to **Command Blue (`#58a6ff`)**, not amber! Authors misled by the variable name used `var(--v4-amber)` for low-filament warnings in `PrinterPage.tsx:255` (coloring `<400g` spools blue instead of warning `--v4-degraded` `#d29922`) and paired orange background `rgba(248,166,40,0.12)` with blue text `var(--v4-amber)` on the Palworld chip (`GamingPage.tsx:387-388`).
  3. **Banned purple, neon glows, and spinners (`DESIGN.md §4/§7`):** `MediaPage.tsx:210,396,1082,1245` hardcodes purple `#a78bfa`; `JarvisPage.tsx:161-163` renders neon box-shadow glows; and `ToolsPage.tsx:111,158`, `JobsPage.tsx:119`, `JarvisPage.tsx:143`, `ContainerLogTail.tsx:120`, and `KioskPage.tsx:274` use `animate-spin` spinners.
- **Concrete fix:**
  - Strip all `border-white/*` and `hover:border-[var(--v4-signal)]` classes from `PrinterPage`, `ToolsPage`, and `KioskPage`; separate inputs/zones strictly by surface step (`--v4-well` `#10141a` or `--v4-raised` `#1c2128` inside `--v4-console` `#161b22`) and `focus-visible:ring-2 focus-visible:ring-[var(--v4-amber)]`.
  - Introduce `--v4-accent: #58a6ff` (aliasing `--v4-amber` temporarily), fix `PrinterPage.tsx:255` to `var(--v4-degraded)`, fix `GamingPage.tsx:387` to `rgba(88,166,255,0.12)`, and replace `#a78bfa` in `MediaPage` with `--v4-amber` / `--v4-info`.
  - Replace `Loader2`/`RefreshCw` `animate-spin` instances with `<Skeleton>` bars or `v4-breathe` status dots.

### 7. Navigation Orphans (`/v4/jarvis`, `/v4/kiosk`), Wrong Active Header Title, Missing Command Palette, and Remounted `AppShell`
- **Where:** `src/v4/components/AppShell.tsx:20-34, 295-327`, `src/v4/V4Router.tsx:53-150`, `src/App.tsx:273-312`
- **What's wrong:**
  1. `/v4/jarvis` and `/v4/kiosk` are registered in `V4Router.tsx:136,146` **but missing from `TABS` in `AppShell.tsx:20-29`**—making Jarvis and Kiosk completely undiscoverable on mobile and desktop without manually editing the URL.
  2. When visiting `/v4/jarvis`, `useActiveTab()` (`AppShell.tsx:31-34`) fails every `pathname.startsWith` check and falls back to `'home'`, causing `MobileHeader` and `DesktopTopBar` to display **"Home"** and highlight the Home nav item while on Jarvis!
  3. `V4Router.tsx:54-144` wraps `<V4ProtectedRoute><AppShell>...</AppShell></V4ProtectedRoute>` inside 9 separate `<Route>` elements instead of a shared `<Outlet />` layout route, unmounting/remounting `AppShell` (and re-firing `AcTemps` `/api/ac/status` polling) on every tab switch, with no catch-all `*` route for typos.
  4. `<CommandPalette />` (`App.tsx:275`) is mounted only in `LegacyShell`, not in the `isV4` branch (`App.tsx:305-312`), and legacy `/chaos` + `/home` routes lack v4 counterparts.
- **Concrete fix:**
  - Add `Jarvis` (mic icon) to `AppShell.tsx` `TABS` (`secondary: true` so it surfaces in the desktop rail and mobile `More` sheet) plus a Kiosk launch link in `DesktopTopBar` / `More`, and fix `useActiveTab` so non-Home unknown paths don't masquerade as `'home'`.
  - Refactor `V4Router.tsx` to use a single `<Route element={<V4ProtectedRoute><AppShell><Outlet /></AppShell></V4ProtectedRoute>}>` parent route + `<Route path="/v4/*" element={<Navigate to="/v4" replace />} />`, and mount `<CommandPalette />` inside the v4 shell.

### 8. Render-Thrashing, Timer-in-Render Bug, Duplicate Mobile/Desktop DOM Trees, and Redundant Polling
- **Where:** `src/v4/pages/GamingPage.tsx:118, 647`, `src/v4/pages/ControlsPage.tsx:270-275, 507-607`, `src/v4/pages/MediaPage.tsx:1531-1593`, `src/v4/pages/PrinterPage.tsx:36-53`
- **What's wrong:**
  1. **Timer leak inside render (`GamingPage.tsx:118`):** `ToastBanner` calls `setTimeout(onDismiss, 4500)` directly in the component function body (unlike `ControlsPage.tsx:199` which wraps it in `useEffect`). Every SSE tick re-renders `GamingPage` and queues **another** 4.5s timer, causing subsequent action toasts to vanish almost immediately!
  2. **Unconditional 1Hz full-page re-render (`ControlsPage.tsx:270-275`):** `setInterval(() => setNow(Date.now()), 1000)` runs forever even when zero trigger jobs are running (`Object.keys(running).length === 0`), forcing the entire 1,291-line `ControlsPage` to reconcile every second.
  3. **Double DOM mounting (`ControlsPage.tsx:507-607`, `MediaPage.tsx:1531-1593`):** Both pages render `<div className="xl:hidden">...all panels...</div>` AND `<div className="hidden xl:grid">...all panels again...</div>` simultaneously in React! On `ControlsPage`, `<UpdatesPanel />` and `<ClaudeTerminalViewer />` each mount **twice** (doubling `/api/updates` fetches and state); on `MediaPage`, `DownloadsPanel`, `ArrPanel`, `TdarrStrip`, and `PlexPanel` all mount twice.
  4. **Redundant REST polling (`PrinterPage.tsx:36-53`, `GamingPage.tsx:647`):** `PrinterPage` manually `fetch`es `/api/printer/p1s` every 15s even though `printer` is already streamed live via SSE `useSnapshot('printer')` (`useSnapshot.tsx:73`); `ChunkyProgress` (`GamingPage.tsx:647`) polls `/gaming/chunky` every 30s even when `homestead` is stopped or `s1Online` is false.
- **Concrete fix:**
  - Wrap `setTimeout(onDismiss, 4500)` in `useEffect` in `GamingPage.tsx:118` (or replace all three copy-pasted `ToastBanner` components with `sonner` `toast()`, since `<Toaster />` is already mounted at `src/App.tsx:310`!).
  - Gate the 1s `setInterval` in `ControlsPage.tsx:271` on `hasActiveRunningJobs`, and refactor `ControlsPage` + `MediaPage` into a single responsive CSS grid (`order-*` / `xl:col-span-*`) or `useMediaQuery('(min-width: 1280px)')` so each panel mounts **once**.
  - Switch `PrinterPage` to `const { data: printer } = useSnapshot('printer')`, and gate `ChunkyProgress` polling on `s1Online && homesteadRunning`.

### 9. Mobile & iPhone (iOS Safari) Blockers: Broken `audio/webm` Recording, `<16px` Input Auto-Zoom, Horizontal Overflow, and LAN-Only API Fallbacks
- **Where:** `src/v4/pages/JarvisPage.tsx:40, 99`, `src/v4/pages/LoginPage.tsx:94, 127`, `src/v4/pages/PrinterPage.tsx:168-194`, `src/v4/pages/ControlsPage.tsx:51`, `src/v4/pages/GamingPage.tsx:36`, `src/v4/components/UpdatesPanel.tsx:40`
- **What's wrong:** `DESIGN.md §1` states *"the owner runs this lab from an iPhone as often as a desk"*, yet four iPhone-breaking bugs exist:
  1. **iOS Safari MediaRecorder crash (`JarvisPage.tsx:40`):** `new MediaRecorder(stream, { mimeType: 'audio/webm' })` throws `NotSupportedError` on iOS Safari (which supports `audio/mp4`, not `audio/webm`), and the `catch` block (`JarvisPage.tsx:53`) misreports it as `"Microphone access denied"`. Worse, `JarvisPage` has no text-input fallback (`POST /api/jarvis/text` in `server/routes/jarvis.js:34` is unused) and `height: 'calc(100dvh - 80px)'` + `pb-24` (`JarvisPage.tsx:99`) double-counts `AppShell`'s header + bottom tab bar padding, clipping the mic button.
  2. **iOS Safari viewport auto-zoom on input focus:** Inputs with `font-size < 16px` (`LoginPage.tsx:94,127` `0.875rem`, `ServicesPage.tsx:698` `0.78rem`, `PrinterPage.tsx:181` `0.75rem`, `UpdatesPanel.tsx:515` `0.75rem`, `ToolsPage.tsx:99` `text-sm`) force iOS Safari to zoom the page on tap and leave it horizontally scrolled.
  3. **375px horizontal overflow (`PrinterPage.tsx:168-194`):** Filament Inventory places its uppercase title, a fixed `w-48` (`192px`) search box, and a sort button inside a non-wrapping `flex items-center justify-between`, overflowing 375px viewports.
  4. **Hardcoded LAN HTTP / localhost API fallbacks:** When `VITE_API_URL` is unset, `ControlsPage.tsx:51`, `GamingPage.tsx:36`, and `UpdatesPanel.tsx:40` fall back to `'http://192.168.50.13:3001/api'` (blocked as Mixed Content / unreachable off-LAN on `https://dash.jojeco.ca/v4`), while `api.ts:1` and `ServicesPage.tsx:47` fall back to `'http://localhost:3001/api'`, whereas `MediaPage`/`PrinterPage` use `'/api'`.
- **Concrete fix:**
  - In `JarvisPage.tsx:40`, feature-detect MIME type (`MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : undefined`), add a text command input bar posting to `/api/jarvis/text`, and replace `calc(100dvh - 80px)` + `pb-24` with flex-fill sizing inside `AppShell`.
  - Use `text-[1rem] sm:text-[0.8125rem]` (`16px` on mobile, compact on desktop) on all `<input>` and `<textarea>` elements.
  - Add `flex-wrap gap-2` and `w-full sm:w-48` to `PrinterPage.tsx:168-183`, and centralize a single `API_BASE = import.meta.env.VITE_API_URL || '/api'` helper in `src/v4/lib/utils.ts`.

### 10. Systemic Accessibility Gaps: `<44px` Touch Targets, WCAG AA Contrast Failures, Missing Keyboard/Focus Semantics, and No `prefers-reduced-motion`
- **Where:** `src/v4/components/AppShell.tsx:136, 287, 295-327`, `src/v4/pages/JarvisPage.tsx:105-112, 123-134`, `src/v4/pages/JobsPage.tsx:179-232`, `src/v4/pages/PrinterPage.tsx:184, 226-232`, `src/v4/components/Primitives.tsx:168-179`, `src/v4/v4.css:1-456`
- **What's wrong:**
  1. **Touch targets well below `44×44px` (`DESIGN.md §4`):** `PrinterPage` spool swatch button is `16×16px` (`PrinterPage.tsx:230`); `UpdatesPanel` checkboxes are `16×16px` (`UpdatesPanel.tsx:595`); `JobsPage` ExternalLink is `13×13px` (`JobsPage.tsx:206-213`) and Applied/undo chip is ~20px tall (`JobsPage.tsx:215-232`); `JarvisPage` replay audio button is ~11px (`JarvisPage.tsx:128-134`) and Clear Trash button is ~21px (`JarvisPage.tsx:105-112`); `GameLogViewer` refresh is `22×22px` (`GamingPage.tsx:295`); `ContainerLogTail` refresh is `24×24px` (`ContainerLogTail.tsx:115`); `ServiceHealthSummary` `"All →"` (`ServiceHealthSummary.tsx:36`) and `ServicesPage` `"+N stopped"` (`ServicesPage.tsx:683`) have `padding: 0`; `DesktopRail` nav links are `36px` tall (`AppShell.tsx:136`).
  2. **WCAG AA contrast failures (`<4.5:1` for small text):**
     - `#fff` text on `#58a6ff` user message bubble (`JarvisPage.tsx:123-124`) = **`2.57:1`** (severe fail; `Primitives.Button` properly uses dark `--v4-void` `#0d1117` on `#58a6ff` = **`8.08:1`**).
     - `--v4-trace` (`#6e7681`) on `--v4-console` (`#161b22`) = **`3.65:1`** and on `--v4-raised` (`#1c2128`) = **`3.29:1`**, yet it is used at `8px–11px` (`0.5rem–0.6875rem`) for timestamps, column headers, and mobile bottom-tab labels (`AppShell.tsx:287`, `LiveDownloadsPanel.tsx:148`).
  3. **Keyboard, Focus, ARIA & Motion:** `Primitives.Button` (`Primitives.tsx:168`), `HostRowD` (`HostTileD.tsx:295`), and `ServiceRow` (`ServicesPage.tsx:267`) lack consistent `:focus-visible` outlines; `JobsPage` row `<div onClick>` (`JobsPage.tsx:179-182`) isn't keyboard-focusable; `MobileBottomNav` "More" trigger (`AppShell.tsx:295-306`) lacks `aria-expanded`/`aria-haspopup` and `Escape` dismissal; `DetailModal` (`DetailModal.tsx:52`) omits `aria-describedby={undefined}`; `Sparkline.tsx:48` generates colliding SVG `<linearGradient id="spark-fill-...">` IDs when multiple charts mount; and `v4.css` has **zero `@media (prefers-reduced-motion: reduce)`** rule for `v4-breathe`, `v4-dot-pulse`, `v4-skeleton`, and `v4-stagger`.
- **Concrete fix:**
  - Enforce `min-h-[44px] min-w-[44px]` hit areas on all mobile/touch buttons (using negative margin or padding wrappers where visual icons stay compact).
  - Change `JarvisPage.tsx:124` user bubble text to `var(--v4-void)` (`#0d1117`), lighten `--v4-trace` from `#6e7681` to `#848d97` (~`4.85:1` on `--v4-console`) or reserve `--v4-trace` strictly for non-essential decorative chrome while bumping `8px–9.6px` labels to `>=11px` (`--v4-readout`).
  - Add a global `.v4-root :focus-visible` `2px solid var(--v4-amber)` rule + `@media (prefers-reduced-motion: reduce)` animation kill-switch in `v4.css`, use `React.useId()` in `Sparkline.tsx`, and add `aria-expanded` + `Escape` listener to `MobileBottomNav`.

---

## 3. Per-Page & Shared Component Review

### 3.1 `HomePageV5` (`src/v4/pages/HomePageV5.tsx`)
- **Visual & Hierarchy:** Strongest page in the app on wide 1080p/1440p monitors—tight 3-column command rhythm, crisp `tabular-nums` telemetry, no light card borders. However, **mobile panel order (`HomePageV5.tsx:50-88`) renders Alerts → Hosts → Services → Live Downloads → Gaming → Storage**, diverging from `DESIGN.md §5` (which specifies Automation + Quick Controls on Home; neither quick controls nor automation status exist on Home today).
- **Layout & Overflow Bugs:**
  - `HomePageV5.tsx:42, 58-62`: Pre-filters `PERSONAL_IDS` out of `labMachines` before passing `machines={labMachines}` to `HostTileDPanel`, hiding `JoPc`, `MacBook`/`JoMac`, and `AinsPC` (Top Issue #5).
  - `v4.css:415-435`: `.v5-col` uses `display: flex` with dead `grid-template-rows` rules and `overflow: hidden` panels that clip bottom hosts/drives on shorter laptop screens (Top Issue #1).
  - Tablet gap (`768px–1279px`): `AppShell` switches to the desktop left rail at `md` (`768px`), while `.v5-grid` stays a single vertical column until `1280px` (`v4.css:409`), creating wide stretched single-column host/service rows across ~950px tablet viewports instead of a 2-column tablet intermediate (`@media (min-width: 768px) and (max-width: 1279px)`).
- **Control-Panel Gaps:** Zero direct quick-actions on Home (e.g., tapping a degraded service group modal in `ServiceGroupDetailModal.tsx` gives no link/button to restart its container, and Gaming/Downloads panels on Home are view-only links).

### 3.2 `ServicesPage` (`src/v4/pages/ServicesPage.tsx`)
- **Strengths:** Clean `AiFleetPanel` integration, filter pills, status stripes, and container inspect modal with `<ContainerLogTail>`.
- **Bugs & UX Issues:**
  - `ServicesPage.tsx:753`: Queries `/docker/containers?all=0`, permanently hiding stopped/exited containers and breaking `+0 stopped` (`ServicesPage.tsx:646, 686`) (Top Issue #2).
  - `ServicesPage.tsx:91-253` (`ServiceDetailBody`): Shows matched Docker container metadata and logs when tapping a Lab Service, **but omits Start/Stop/Restart buttons**, forcing a tedious second lookup in the Containers section below.
  - `ServicesPage.tsx:500, 523, 533`: `ContainerActions` buttons use `1px solid rgba(...)` tinted borders instead of borderless tonal fills (`DESIGN.md §4`).
  - `ServicesPage.tsx:47, 740`: Hardcodes fallback `'http://localhost:3001/api'` instead of relative `'/api'`.
  - `ServicesPage.tsx:683, 698, 795`: Search input uses `text-[0.78rem]` (triggers iOS Safari auto-zoom on focus), and `+N stopped` / `Hide` QuickLinks buttons use `padding: 0` (`<20px` tap height).
  - Missing **Docker System Prune** button (`POST /api/docker/prune` exists in `server/routes/docker.js:53`).

### 3.3 `MediaPage` (`src/v4/pages/MediaPage.tsx`)
- **Strengths:** Rich data density across Plex active streams, SABnzbd + qBittorrent queues, Sonarr/Radarr calendars & queues, and Tdarr transcode savings.
- **Visual & Token Issues:**
  - **Banned purple (`DESIGN.md §7`):** Hardcodes `#a78bfa` / `rgba(167,139,250,0.14)` for Movie badges and Tdarr GPU transcode indicators at `MediaPage.tsx:210, 396, 1082, 1245`.
  - `QuickLinks` (`MediaPage.tsx:1533, 1583` -> `QuickLinks.tsx:61`): Uses `hover:bg-white/5` instead of `--v4-raised`.
- **Performance & Architecture:**
  - **Double DOM tree (`MediaPage.tsx:1531-1593`):** Renders every panel (`QuickLinks`, `PlexPanel`, `DownloadsPanel`, `ArrPanel`, `TdarrStrip`) **twice**—once inside `<div className="xl:hidden">` and again inside `<div className="hidden xl:grid">`—doubling component instances, timers, and modal subtrees.
- **Control-Panel Gaps:**
  - `TorrentDetailModal` (`MediaPage.tsx:298-355`) and `DownloadsPanel` (`MediaPage.tsx:594-767`) lack Pause / Resume / Delete / Recheck / Add Magnet buttons despite `server/routes/torrents.js:54-81`.
  - `TdarrStrip` (`MediaPage.tsx:1294-1409`) lacks `JoPc` / `AinsPC` GPU worker Enable/Disable toggles despite `POST /api/controls/tdarr/:node/:action` (`server/routes/controls.js:111`).
  - No SABnzbd queue pause/resume or Sonarr/Radarr manual search trigger buttons.

### 3.4 `ControlsPage` (`src/v4/pages/ControlsPage.tsx`)
- **Strengths:** Closest page to the "full control panel" vision—Server Wake/Shutdown/Reboot, AdGuard pause/resume (`15m`/`1h`/`indefinite`), Quick Triggers with live log polling, Scheduled Automation history, `UpdatesPanel`, and `ClaudePanel` + `ClaudeTerminalViewer`.
- **Bugs, Visuals & Perf:**
  - **Unconditional 1Hz re-render (`ControlsPage.tsx:270-275`):** `setInterval(() => setNow(Date.now()), 1000)` ticks every second forever even when `running` is empty.
  - **Double DOM tree (`ControlsPage.tsx:507-607`):** Mounts two copies of `<ServerPowerPanel>`, `<AdGuardPanel>`, `<QuickActionsPanel>`, `<AutomationPanel>`, `<UpdatesPanel>`, `<ClaudePanel>`, and `<ClaudeTerminalViewer>` (`xl:hidden` + `hidden xl:grid`), causing `<UpdatesPanel>` to fetch `/api/updates` twice on page load!
  - **Dead `UNRESPONSIVE` state (`ControlsPage.tsx:675, 690, 697-702`):** `POWER_META` defines an `'unresponsive'` state (`amber` warning), and comments explain how ping-up + SSH-down indicates a wedged host, **but `getServerPowerState` never returns `'unresponsive'`**—dead code hiding a critical failure mode.
  - **Remote Claude gap & hardcoded nominal stripe (`ControlsPage.tsx:823, 862-910`):** `ClaudePanel` hardcodes `boxShadow: 'inset 2px 0 0 var(--v4-nominal)'` even when `lab.claudeRunning` is `false`, and provides Stop/Restart only for `ct100` (no Stop/Restart once Claude is moved to `server1` or `server3`, despite `server/routes/controls.js:223-249` supporting `:machine`).
  - **LAN HTTP fallback (`ControlsPage.tsx:51`):** `'http://192.168.50.13:3001/api'` breaks off-LAN over HTTPS.
  - **Tinted button borders (`ControlsPage.tsx:178, 216, 891, 901, 931, 1044, 1054, 1128, 1188, 1223-1246`):** Heavy reliance on `1px solid rgba(...)` outlines on buttons/toasts.

### 3.5 `GamingPage` (`src/v4/pages/GamingPage.tsx`)
- **Strengths:** Dedicated control cards for Minecraft (`homestead`, `stoneblock4`, `atm10`) and Palworld, player lists, RCON/console log viewer, and Chunky pre-generation progress.
- **Bugs & UX Issues:**
  - **Render-body `setTimeout` bug (`GamingPage.tsx:118`):** `ToastBanner` invokes `setTimeout(onDismiss, 4500)` directly during render (not inside `useEffect`), stacking timers on every SSE update and prematurely dismissing toasts!
  - **Token mismatch (`GamingPage.tsx:387-388`):** `PAL` badge uses orange fill `rgba(248,166,40,0.12)` with blue text `var(--v4-amber)` (`#58a6ff`).
  - **Unnecessary background polling (`GamingPage.tsx:647`):** `ChunkyProgress` polls `/gaming/chunky` every 30s even when `s1Online` is false or `homestead` is stopped.
  - **Tiny touch target (`GamingPage.tsx:295`):** `GameLogViewer` refresh button is `22×22px` (`width: 22, height: 22`).
  - **LAN HTTP fallback (`GamingPage.tsx:36`):** `'http://192.168.50.13:3001/api'`.

### 3.6 `PrinterPage` (`src/v4/pages/PrinterPage.tsx`) — *Unfinished Relative to Home*
- **Design & Border Violations:**
  - Light borders on Filament search input (`PrinterPage.tsx:181`: `border border-white/5 focus:border-[var(--v4-signal)]`) and weight sort button (`PrinterPage.tsx:187`: `border border-white/5 hover:border-[var(--v4-signal)]`), plus `text-white` (`103, 181, 200, 293`) and hardcoded hex colors `#1a1414` (`70`), `#ccc` (`295`), `#888` (`300`).
  - **Wrong warning color (`PrinterPage.tsx:255`):** `spool.weight_remaining_g < 400 ? "text-[var(--v4-amber)]"` colors low-ish filament **blue** (`#58a6ff`) instead of `--v4-degraded` (`#d29922`).
  - **Wrong sort icon (`PrinterPage.tsx:190`):** Uses alphabetical `<ArrowDownAZ>` / `<ArrowUpAZ>` icons for sorting **numeric gram weight**!
- **Mobile & Accessibility Bugs:**
  - **375px horizontal overflow (`PrinterPage.tsx:168-194`):** Non-wrapping header row with title + `w-48` input + sort button overflows narrow mobile screens; search input `text-[0.75rem]` triggers iOS auto-zoom.
  - **`16×16px` touch target (`PrinterPage.tsx:226-232`):** The spool color circle `<button className="w-4 h-4">` is 28px below the 44px minimum, and the rest of the spool card isn't clickable.
- **Polling & Control-Panel Gaps:**
  - Redundantly polls `/api/printer/p1s` every 15s (`PrinterPage.tsx:36-53`) instead of reading `useSnapshot('printer')`.
  - Spool modal (`PrinterPage.tsx:277-310`) is a read-only color preview despite `POST /api/filament/:id/update` existing in `server/server.js:1650`, and P1S telemetry card has no Pause/Resume print or chamber light controls.

### 3.7 `JobsPage` (`src/v4/pages/JobsPage.tsx`) — *Unfinished Relative to Home*
- **Visual & Layout Inconsistency:**
  - Wrapped in `max-w-2xl mx-auto p-4 pb-24` (`JobsPage.tsx:100`)—creating double padding inside `AppShell` `<main>` on mobile and leaving ~60% of the viewport empty on desktop instead of a 2-column list + detail split, and omitting the shared `<PageTitle>` primitive.
  - Numeric match scores, filter counts, and relative timestamps (`JobsPage.tsx:109, 144, 172, 198`) use proportional sans-serif instead of `<Mono>` / `tabular-nums` (`DESIGN.md §3`).
  - Uses spinning `<RefreshCw className="animate-spin">` (`JobsPage.tsx:119`).
- **Functional & UX Bugs:**
  - **Discarded match rationale (`JobsPage.tsx:12`):** Fetches `job.reason` in the `Job` interface **and never renders it**, hiding *why* a job scored 85 vs 62!
  - **Silent error swallowing + fake scan completion (`JobsPage.tsx:60-71, 89-97`):** `fetchJobs` uses `try { ... } finally { setLoading(false) }` with **no `catch`**, causing unhandled promise rejections and an empty `"No jobs matching filter"` lie when `/api/jobs` fails; `triggerScan` fakes a `setTimeout(..., 3000)` reload instead of tracking actual scan completion.
- **Accessibility:**
  - Entire job card text block (`JobsPage.tsx:179-182`) uses `<div onClick={() => window.open(...)}>` with no `<a href>`, `role`, `tabIndex`, or keyboard Enter handler (blocks middle-click open-in-tab and keyboard users); `<ExternalLink>` (`206-213`) is `13×13px` and the `Applied / undo` button (`215-232`) is ~20px tall.

### 3.8 `ToolsPage` (`src/v4/pages/ToolsPage.tsx`) — *Unfinished Relative to Home*
- **Design & Border Violations:**
  - **4 explicit `border-white/*` light-border violations:** TTS `<textarea>` (`ToolsPage.tsx:99`: `border border-white/5 focus:border-[var(--v4-signal)]`), audio output card (`ToolsPage.tsx:117`: `border border-white/5`), ASR dropzone (`ToolsPage.tsx:154`: `border-2 border-dashed border-white/10 hover:border-[var(--v4-signal)]`), and transcript output (`ToolsPage.tsx:179`: `border border-white/5`).
  - Uses `text-white` (`99, 122, 179`), white primary button hover (`107`: `hover:bg-[var(--v4-signal)]`), and `<Loader2 className="animate-spin">` spinners (`111, 158`).
- **UX & Functional Bugs:**
  - **Browser `alert()` popup (`ToolsPage.tsx:41`):** `alert('Error generating audio.')` blocks the main thread and breaks the dark control-room aesthetic (whereas ASR right next to it puts `"Error: Failed to transcribe audio."` inside the transcript string at line 70!).
  - **Broken drag-and-drop affordance (`ToolsPage.tsx:152-167`):** Styled like a dashed dropzone, **but has no `onDragOver` / `onDrop` handlers**—dragging an audio file onto it navigates the browser tab away to play the local file! Also shows no selected filename after upload and has no **Copy Transcript** button.
  - **Object URL leak (`ToolsPage.tsx:37`):** `URL.createObjectURL(blob)` is never revoked on component unmount.

### 3.9 `JarvisPage` (`src/v4/pages/JarvisPage.tsx`) — *Unfinished & Broken on iPhone*
- **Critical iPhone & Functional Bugs:**
  - **Unreachable from navigation (`AppShell.tsx:20-34`):** Missing from `AppShell` `TABS`, and `useActiveTab()` mislabels the top header as **"Home"** while on `/v4/jarvis`.
  - **iOS Safari crash (`JarvisPage.tsx:40`):** Hardcodes `{ mimeType: 'audio/webm' }`, throwing `NotSupportedError` on iOS Safari and falsely displaying `"Microphone access denied"` (`JarvisPage.tsx:53`).
  - **No text input + unhydrated session history:** Backend `server/routes/jarvis.js:34, 60` provides `POST /api/jarvis/text` and `GET /api/jarvis/history/:sessionId`, yet `JarvisPage` is voice-only and never loads prior messages for the `jarvis_session_id` stored in `localStorage` (`JarvisPage.tsx:18-24`).
  - **Fake online status (`JarvisPage.tsx:103`):** Hardcodes nominal green dot + `"JARVIS ONLINE"` without checking `/api/jarvis/health`.
  - **Audio `createObjectURL` leak (`JarvisPage.tsx:85`):** Never calls `URL.revokeObjectURL`.
- **Visual, Sizing & Accessibility Bugs:**
  - `height: 'calc(100dvh - 80px)'` + `p-4 pb-24` (`JarvisPage.tsx:99`) conflicts with `AppShell`'s header and mobile bottom-bar padding, clipping/misaligning the mic control.
  - **WCAG AA contrast fail (`JarvisPage.tsx:123-124`):** White `#fff` text on `#58a6ff` user bubble = **`2.57:1`** (use `var(--v4-void)` `#0d1117`).
  - **Banned neon glows & spinner (`JarvisPage.tsx:143, 161-163`):** `0 0 24px rgba(239,68,68,0.2)` / `0 0 16px rgba(99,150,255,0.15)` box-shadows + `<Loader2 className="animate-spin">`.
  - Tiny Clear Trash (`p-1` ~21px, `105-112`) and Replay (`128-134`, ~11px, missing `aria-label`) buttons.

### 3.10 `KioskPage` (`src/v4/pages/KioskPage.tsx`) — *Legacy Unported Page*
- Covered in detail in **Top Issue #4**: false-green `HEALTHY` banner when endpoints fail or 401 (`KioskPage.tsx:518`), infinite `Loading…` spinner on `null` fetch errors (`272, 307, 335, 403`), non-responsive inline `repeat(4, 1fr)` grid overflowing mobile screens (`639`), light `rgba(255,255,255,0.07)` borders on every card (`106, 530, 599`), legacy `#080810` / `#14b8a6` palette, 6 separate 30s polls instead of SSE `useSnapshot`, and buggy `UptimeKumaCard` red-threshold math (`350`).

### 3.11 `LoginPage` (`src/v4/pages/LoginPage.tsx`)
- **Strengths:** Cleanest standalone view—borderless `--v4-console` card over `--v4-void`, proper `<label htmlFor>`, `autoComplete`, and `role="alert"` fault copy.
- **UX & Accessibility Polish Needed:**
  - **iOS Safari auto-zoom (`LoginPage.tsx:94, 127`):** `text-[0.875rem]` (`14px`) on email/password inputs causes iPhone Safari to zoom in on focus; change to `text-[1rem] sm:text-[0.875rem]`.
  - **Lost deep-link destination (`V4Router.tsx:42`, `LoginPage.tsx:30`):** Redirecting unauthenticated users to `/v4/login` discards `location.pathname`, always sending users to `/v4` after login instead of e.g. `/v4/controls`; visiting `/v4/login` while already authenticated also doesn't auto-redirect to `/v4`.
  - **Raw Firebase error strings (`LoginPage.tsx:32`):** Displays raw SDK strings like `Firebase: Error (auth/invalid-credential).` instead of human-friendly operator copy.
  - **Tap target & focus styling (`LoginPage.tsx:99-107, 158`):** Submit button `h-10` (`40px`) is shy of `44px`; inputs mutate `e.currentTarget.style.boxShadow` imperatively with `outline: 'none'` instead of CSS `:focus-visible`.

### 3.12 Shared Shell, Components, CSS & Dead Code (`src/v4/components/*`, `v4.css`, `lib/utils.ts`)
- **`AppShell.tsx`:**
  - `AcTemps` (`AppShell.tsx:39-65`): Uses `'http://localhost:3001/api'` fallback (`37`), hides completely on mobile (`hidden md:block` in `DesktopTopBar` only), and offers no click-to-control AC modal despite `server/routes/ac.js`.
  - `DesktopRail` (`AppShell.tsx:109, 136, 159, 169`): Nav items, collapse toggle, and sign-out buttons are `36px` tall (`<44px`), and collapsed rail tooltips rely purely on native `title` attributes (unusable on touch tablets).
  - `MobileBottomNav` (`AppShell.tsx:287, 295-327`): `0.6rem` (`9.6px`) labels in `--v4-trace` (`3.65:1` contrast); `"More"` button lacks `aria-expanded`/`aria-haspopup` and `Escape` key handler.
- **`AlertBell.tsx`, `AlertStrip.tsx` & `AlertHistoryModal.tsx`:**
  - `AlertBell.tsx:132` & `AlertHistoryModal.tsx:13`: Mixed API URL strategies (`AlertHistoryModal` falls back to `http://localhost:3001/api`).
  - `AlertStrip.tsx:67-82`: Nominal `"All systems nominal — alert history"` bar has ~28px tap height (`py-1.5`) on mobile.
- **`HostTileD.tsx` & `HostDetailModal.tsx`:**
  - `HostTileD.tsx:543-551`: Injects an inline `<style>` tag redefining `@keyframes v4DotPulse` and `.v4-dot-pulse` on every render, duplicating `src/v4/v4.css:227-231`!
  - `HostTileD.tsx:557` & `GamingGlance.tsx:82`: `inset 0 1px 0 rgba(255,255,255,0.03)` top white highlight bevel contradicts no-light-borders.
  - `HostDetailModal.tsx` is purely informational—no quick jump or button to Wake/Reboot/Shutdown the host (even though `ControlsPage` already implements `/controls/server/:id/:action`).
- **`Sparkline.tsx`:**
  - `Sparkline.tsx:48, 60`: Non-unique SVG `<linearGradient id="spark-fill-...">` derived only from color name (`color.replace(/[^a-z0-9]/gi, '')`). Multiple `Sparkline` instances sharing a color produce duplicate DOM `id`s; if an ancestor hides/unmounts one SVG, remaining charts can lose their gradient fill. Fix with `useId()`.
- **`UpdatesPanel.tsx`:**
  - `UpdatesPanel.tsx:40`: Hardcoded `'http://192.168.50.13:3001/api'` fallback; `UpdatesPanel.tsx:345, 384, 428` uses `1px solid` tinted borders; `UpdatesPanel.tsx:515` search input uses `0.75rem` font (iOS zoom); `UpdatesPanel.tsx:595` row checkboxes are `16×16px`.
- **`ContainerLogTail.tsx` & `ClaudeTerminalViewer.tsx`:**
  - `ContainerLogTail.tsx:12` & `ClaudeTerminalViewer.tsx:14`: `'http://localhost:3001/api'` fallback; `ContainerLogTail.tsx:115, 120` uses a `24×24px` refresh button with `animate-spin`.
- **`QuickLinks.tsx`:**
  - `QuickLinks.tsx:12-15`: `if (svc.checkUrl) url = svc.checkUrl;` overwrites the `proxmox` HTTPS port `:8006` override immediately above it if `checkUrl` is populated; `QuickLinks.tsx:50` leaves dead `const disabledRemotely = false;` logic; `QuickLinks.tsx:61` uses `hover:bg-white/5`.
- **Dead / Orphaned Components & Duplicated Utilities (Cleanup Inventory):**
  - **5 completely dead component files (799 LOC total)** with zero live route imports:
    1. `src/v4/components/HomeSummaryWidgets.tsx` (279 lines — 0 imports)
    2. `src/v4/components/HostTile.tsx` (154 lines — superseded by `HostTileD.tsx`, 0 imports)
    3. `src/v4/components/AutomationDigest.tsx` (113 lines — 0 imports)
    4. `src/v4/components/LoadChartsPanel.tsx` (88 lines — 0 imports)
    5. `src/v4/components/TorrentsPanel.tsx` (56 lines — imported *only* by dead `HomeSummaryWidgets.tsx`)
    *(Plus `HostTileD.tsx` contains 3 unused visual variants `HostRowA`/`B`/`C` if only `D` is shipped—verify before trimming.)*
  - **~75 lines of dead CSS in `src/v4/v4.css`:** `.v4-command-grid` (`v4.css:145-153`), `.v4-page-enter` (`v4.css:202-209`), and retired `react-grid-layout` `.v4-widget*` / `.v4-home-grid*` rules (`v4.css:233-293`).
  - **Copy-pasted helpers & UI primitives:**
    - `fmtBytes` implemented 4× with conflicting math: base-1024 in `src/v4/lib/utils.ts:9` vs base-1000 in `LiveDownloadsPanel.tsx:61` and `KioskPage.tsx:69`!
    - `relativeTime` implemented 3× (`lib/utils.ts:30`, `AlertHistoryModal.tsx:26`, `JobsPage.tsx:39`).
    - `ConfirmModal`, `ToastBanner`, and `authGet`/`authPost` copy-pasted across `ControlsPage.tsx`, `GamingPage.tsx`, and `UpdatesPanel.tsx` despite `sonner` `<Toaster />` already mounted in `src/App.tsx:310`.

---

## 4. Quick Wins (Under 15 Minutes Each)

1. **Restore missing personal rigs (`JoPc`, `MacBook`, `AinsPC`) on Home (`2 min`):** In `src/v4/pages/HomePageV5.tsx:59`, change `machines={labMachines}` to `machines={machines}` and delete the pre-filter on line 42 so `HostTileDPanel`'s `personal rigs` section renders.
2. **Un-hide stopped Docker containers so crashed containers can be started (`3 min`):** Change `src/v4/pages/ServicesPage.tsx:753` from `/docker/containers?all=0` to `/docker/containers?all=1`. The existing `+N stopped` toggle (`line 686`) and Start action immediately start working.
3. **Fix `GamingPage` toast premature-dismissal bug (`2 min`):** Wrap `setTimeout(onDismiss, 4500)` at `src/v4/pages/GamingPage.tsx:118` inside `useEffect(() => { const id = setTimeout(onDismiss, 4500); return () => clearTimeout(id); }, [toast, onDismiss])`.
4. **Fix `HomePageV5` column proportions (`5 min`):** In `src/v4/v4.css:415`, add `display: grid; min-height: 0;` to `.v5-col` at `@media (min-width: 1280px)` and remove `flex: 1 1 0` from `.v5-col .v5-panel` (`line 433`) so `62fr 38fr` and `42fr 58fr` row ratios actually apply.
5. **Purge `border-white/*` light borders on `PrinterPage` & `ToolsPage` (`8 min`):** Remove `border border-white/5`, `border-white/10`, and `hover:border-[var(--v4-signal)]` / `focus:border-[var(--v4-signal)]` at `src/v4/pages/PrinterPage.tsx:181,187` and `src/v4/pages/ToolsPage.tsx:99,117,154,179`; use `bg-[var(--v4-well)]` + `focus-visible:ring-2 focus-visible:ring-[var(--v4-amber)]`.
6. **Fix `--v4-amber` blue-vs-warning bugs & banned purple (`6 min`):** Change `src/v4/pages/PrinterPage.tsx:255` from `text-[var(--v4-amber)]` to `text-[var(--v4-degraded)]` (and swap `ArrowDownAZ`/`ArrowUpAZ` at line 190 to `ArrowDownWideNarrow`/`ArrowUpNarrowWide`), fix `GamingPage.tsx:387` Palworld pill background to `rgba(88,166,255,0.12)`, and replace `#a78bfa` purple in `MediaPage.tsx:210,396,1082,1245` with `var(--v4-amber)`.
7. **Fix `JarvisPage` on iOS Safari + contrast fail + nav entry (`12 min`):** Add MIME fallback (`audio/mp4` when `audio/webm` is unsupported) at `src/v4/pages/JarvisPage.tsx:40`, change user bubble text at `line 124` from `#fff` to `var(--v4-void)` (`2.57:1` → `8.08:1` contrast), and add `{ id: 'jarvis', label: 'Jarvis', path: '/v4/jarvis', icon: Mic, secondary: true }` to `TABS` in `src/v4/components/AppShell.tsx:28`.
8. **Stop `ControlsPage` from re-rendering every 1 second while idle (`3 min`):** In `src/v4/pages/ControlsPage.tsx:270-275`, guard the `1000ms` interval with `if (!Object.values(running).some(Boolean)) return;` so idle sessions do zero timer ticks.
9. **Switch `PrinterPage` from 15s manual `fetch` to SSE `useSnapshot('printer')` & fix mobile header overflow (`8 min`):** Replace `fetchPrinter` + `setInterval` (`src/v4/pages/PrinterPage.tsx:36-53`) with `const { data: printer } = useSnapshot('printer')`, and add `flex-wrap gap-2` + `w-full sm:w-48` to the Filament header (`lines 168-183`).
10. **Standardize API base URL & eliminate remote Mixed-Content failures (`10 min`):** Export `export const API_URL = import.meta.env.VITE_API_URL || '/api';` from `src/v4/lib/utils.ts` and replace hardcoded `'http://192.168.50.13:3001/api'` (`ControlsPage.tsx:51`, `GamingPage.tsx:36`, `UpdatesPanel.tsx:40`) and `'http://localhost:3001/api'` (`ServicesPage.tsx:47,740`, `AppShell.tsx:37`, `ContainerLogTail.tsx:12`, `ClaudeTerminalViewer.tsx:14`, `AlertHistoryModal.tsx:13`).
11. **Prevent iOS Safari auto-zoom on inputs (`6 min`):** Set `text-[1rem] sm:text-[0.8125rem]` on `<input>`/`<textarea>` in `LoginPage.tsx:94,127`, `ServicesPage.tsx:698`, `PrinterPage.tsx:181`, `ToolsPage.tsx:99`, and `UpdatesPanel.tsx:515`.
12. **Fix duplicate SVG gradient IDs, duplicate `<style>` tag, and `prefers-reduced-motion` (`8 min`):** Use `const uid = useId()` for `<linearGradient id>` in `src/v4/components/Sparkline.tsx:48`, delete the duplicate `@keyframes v4DotPulse` `<style>` block in `src/v4/components/HostTileD.tsx:543-551`, and add `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` to `src/v4/v4.css`.
13. **Delete 799 lines of dead v4 components + 75 lines of dead CSS (`5 min`):** Remove unused `HomeSummaryWidgets.tsx`, `HostTile.tsx`, `AutomationDigest.tsx`, `LoadChartsPanel.tsx`, and `TorrentsPanel.tsx`, plus `.v4-command-grid`, `.v4-page-enter`, and `.v4-widget*`/`.v4-home-grid*` in `src/v4/v4.css`.
