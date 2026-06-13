# v3 Refactor — Page Porting Phase TODO

**Branch:** refactor/v3  
**Staging:** http://localhost:3007 (container: jojeco-dashboard-v3)  
**Prod (untouched):** http://localhost:3005 (container: jojeco-dashboard)

---

## Completed (scaffold)

- [x] Cloned to /opt/jojeco-dashboard-v3, branch refactor/v3
- [x] shadcn/ui toolchain: tailwindcss-animate, class-variance-authority, clsx, tailwind-merge, Radix UI primitives, sonner
- [x] Path alias `@/` in tsconfig + vite.config
- [x] `src/lib/utils.ts` — cn() helper
- [x] `components.json` — shadcn config
- [x] `tailwind.config.js` — CSS variable tokens + shadcn container/borderRadius + extended keyframes
- [x] `src/index.css` — shadcn @layer base with :root (dark) + .light tokens; JojeCo teal accent (hsl 174 72% 40%), near-black blue background; legacy tokens preserved
- [x] `src/components/ui/` — button, card, badge, dialog, tabs, table, tooltip, skeleton, sonner
- [x] `src/App.tsx` — dual theme toggle (data-theme attr + .dark/.light class), Toaster added, all routes preserved
- [x] `public/manifest.json` — name "JojeCo Lab", theme-color #14b8a6
- [x] `public/sw.js` — cache-first SW (assets), network-first (navigation), skips /api
- [x] `docker-compose.staging.yml` — port 3007, external prod network
- [x] TS build clean + staging container verified (200 + root div)

---

## ControlsPage Feature-Parity Checklist

**Source:** `src/Pages/ControlsPage.tsx` (837 lines) → new `src/Pages/Controls/`

### Parity: 47/47 features ported

#### Server Power Controls (6/6 servers)
- [x] CT100, Server1, Server2, Server3, MacMini, JoPc — all rendered
- [x] Online/offline status dot from snapshot serverStatus section
- [x] Restart button (Server2 → confirm dialog: warnRestart)
- [x] Shutdown button (ALL servers → confirm dialog)
- [x] Wake (WoL) button (canWake servers)
- [x] Claude stop (CT100, S1, S3 → confirm dialog)
- [x] Claude restart (no confirm — lower risk)
- [x] CT100 special: no restart/shutdown (claudeLocal=true)
- [x] Loading states per button key

#### Automation Status
- [x] Jobs from snapshot automation section
- [x] Per-job: label, schedule, last run, status icon, badge
- [x] Running indicator cross-referenced with triggerJobs
- [x] Log snippet in mono pre block

#### Manual Triggers (6/6)
- [x] health, backup, snapshot, sync-context, claude-server3, claude-server1
- [x] Fire → POST /controls/trigger/:id
- [x] Abort → POST /controls/trigger/:id/abort (while running)
- [x] Job status display: running/elapsed, done, error, aborted
- [x] Polling 3s while any job running (interval only, not setInterval in page)
- [x] Toast on complete/error

#### Container Updates
- [x] Check / Re-check → GET /updates/available[?force=1]
- [x] Checkbox selection + "Select all"
- [x] Apply → POST /updates/apply (confirm dialog)
- [x] Apply job tracking
- [x] Cached/checked timestamp

#### S2→S3 Failover Panel
- [x] S2/S3 online status, watchdog badge, failover active/normal badge
- [x] Last sync display, output box
- [x] Activate → confirm dialog
- [x] Deactivate → confirm dialog (only when active)
- [x] Sync Now (no confirm)
- [x] Refresh button

#### Container Controls
- [x] Full list from GET /controls/containers
- [x] Search + filter (all/running/stopped)
- [x] Restart (no confirm), Stop (confirm dialog), Start (no confirm)

#### Confirm Dialogs (7 distinct scenarios, all via shadcn Dialog)
- [x] Server restart (Server2/Proxmox only)
- [x] Server shutdown (ALL servers)
- [x] Claude stop
- [x] Failover activate
- [x] Failover deactivate
- [x] Container stop
- [x] Apply updates

#### Design System Compliance
- [x] Surface elevation only — no white/hard borders
- [x] Hairlines ≤6% alpha (var(--line)) for structural dividers only
- [x] 10px uppercase section labels with hairline rule
- [x] Status color only on status content (dots, badges, numbers)
- [x] Destructive: var(--err) tint on bg+text
- [x] minHeight 40px buttons (thumb targets)
- [x] minWidth: 0 on all grid/flex items
- [x] Mobile single-flow at 390px, safe-area paddingBottom
- [x] tabular-nums on elapsed timers
- [x] No setInterval in page component (snapshot for serverStatus/automation; trigger poll only while jobs running)

---

## Phase 1 — Page Porting (next up)

Port each page from inline CSS + custom j-* classes to shadcn/ui + Tailwind.
Keep feature parity. Use `<Card>`, `<Badge>`, `<Button>`, `<Table>`, `<Tabs>`.

Priority order (Jordan's: Looks/UX first):

| Page | File | Notes |
|---|---|---|
| Lab | ~~LabPage.tsx (999 lines)~~ → `src/Pages/Lab/` | **DONE** — decomposed, shadcn/ui, useSnapshot |
| Services | DashboardNew.tsx | App tile grid → shadcn Card |
| Controls | ControlsPage.tsx | Buttons already natural fit for shadcn Button |
| Media | MediaPage + TorrentsPage | Table component fits |
| Minecraft | MinecraftPage.tsx | — |
| Chaos | ChaosPage.tsx | — |
| Jarvis | JarvisPage.tsx | — |
| Home Assistant | HomeAssistantPage.tsx | — |
| Login | Login.tsx | Card + form |
| Kiosk | Kiosk/KioskPage.tsx | Keep as-is until layout finalized |

---

## Phase 1 — Additional Items

- [x] `/api/snapshot` endpoint on API — single aggregated payload to replace 21 pollers (landed via origin/main merge)
- [x] `useSnapshot` hook — `src/hooks/useSnapshot.tsx`; `<SnapshotProvider>` mounted in App.tsx inside AuthProvider; polls every 5s LAN / 20s WAN; pauses on document.hidden; 401 → redirect to /login
- [x] Decompose LabPage.tsx into sub-components (it's 999 lines) — new `src/Pages/Lab/` directory
- [ ] Remove `/ai` orphan route (Odysseus replaced LibreChat)
- [x] Feature-parity checklist per page before marking done — see LabPage checklist below

---

## LabPage Feature-Parity Checklist

**Source:** old `src/Pages/LabPage.tsx` (999 lines) → new `src/Pages/Lab/`

### Layout & structure
- [x] Page header — "Lab Overview" title + date subtitle
- [x] Refresh button with spinning icon while loading + last-refresh timestamp
- [x] Hero stat tiles row (auto-fill grid, minmax 160px)
- [x] Alerts/Automation/AdGuard/Backup info-panels row
- [x] Hardware (Always-On + Burst Nodes) + AI Fleet two-column layout (`j-grid-half`)
- [x] Quick Access tile grid at bottom (18 links with emoji icons)

### Stat tiles (hero row)
- [x] Lab Status tile — Healthy/Degraded/Critical with color + per-service chips + critical issue messages
- [x] Services tile — clickable, opens slide-out health panel; shows up/down counts + progress bar; "View all →" hint
- [x] Containers tile — links to /services; running count + stopped/unhealthy chips
- [x] AI Fleet tile — online/total nodes + node abbreviation chips + total model count
- [x] Gateway (LiteLLM) tile — Up/Down status + spend display
- [x] LVM Pool tile — percentage + color-coded progress bar (warn>70 / crit>85)
- [x] Claude Agent tile — Running/Down/Unknown status
- [x] Minecraft mini-tile — links to /minecraft; running/total servers + player count + server name chips; polling every 30s ← NOTE: now via shared snapshot (section: minecraft)

### Machine Cards
- [x] Online/offline state with pulsing dot and opacity 50% when offline
- [x] Machine name, role, host (monospace)
- [x] CPU temp badge (color-coded via tempColor)
- [x] GPU temp badge (skips integrated GPUs)
- [x] Offline chip when machine is down
- [x] Expand/collapse toggle button (ChevronRight/Down)
- [x] Ring gauges row: CPU, RAM (with total), Disk (combined, warn 75/crit 90), GPU util, NVENC util
- [x] Mobile size (60px) vs desktop (68px) ring gauge sizing
- [x] Expand section — per-drive breakdown with label, bar, used/total (shown when >1 disk)
- [x] Expand section — GPU detail panel: VRAM, 3D util, NVENC, temp (skips integrated)
- [x] Expand section — Temperature 24h sparkline (CPU blue, GPU orange, danger zone at 80°)
- [x] Expand section — Top 8 processes table (name, CPU%, MEM%, color-coded high values)
- [x] fetchProcesses called on expand (lazy-loaded per machine)
- [x] Skeleton while processes loading
- [x] Always-On sort order (server1 → server2 → server3 → macmini)
- [x] Burst Nodes section (machines where always_on=false)
- [x] Skeleton placeholders while loading

### AI Node Cards (Inference Fleet)
- [x] Online/offline with pulsing dot (blue when in-use, green when idle, grey when offline)
- [x] Node name, role
- [x] Model count (big number top-right)
- [x] Model list (sorted: jojeco- aliases first, then by size; show max 4 + "+N more")
- [x] tok/s speed badge per model (green≥80, yellow≥20, orange otherwise)
- [x] jojeco- prefixed models highlighted in accent color
- [x] Active session indicator (model name + pulsing blue dot)

### Service Health Slide-Out Panel
- [x] Backdrop overlay (click to close)
- [x] Slide in from right (translateX animation, 280ms cubic-bezier)
- [x] Header: title + service count + close button
- [x] Services sorted: offline first, then alphabetical
- [x] Per-service row: status dot (pulsing when up), name, URL, Up/Down label, response time, last-checked age
- [x] Skeleton loading state (6 items)
- [x] "No service data" empty state
- [x] Red border highlight for offline services

### Alerts Panel
- [x] Bell icon + "Recent Alerts" title + count
- [x] Up to 8 alerts in scrollable list (max-height 180px)
- [x] Priority color-coded dot (err≥4, warn≥3, t3 otherwise)
- [x] Time-ago display (m/h/d)
- [x] Expand/collapse per alert (click anywhere on row)
- [x] Expanded: title (if set) + full message + tags chips
- [x] "No recent alerts" empty state

### Automation Panel
- [x] CheckCircle icon + "Automation" title
- [x] Per-job row: status icon (CheckCircle/XCircle/AlertTriangle), label, schedule, last-run date
- [x] Error status colors last-run date red
- [x] "Loading..." while empty

### AdGuard Panel
- [x] Shield icon + "AdGuard DNS" title
- [x] Total queries (24h) with k-suffix formatting
- [x] Blocked percentage
- [x] Avg processing time (if available)
- [x] "Connecting..." while loading

### GDrive Backup Panel
- [x] HardDrive icon + "GDrive Backup" title
- [x] Status badge (OK/Error/Unknown) with color
- [x] Last run date
- [x] Last 4 lines of message in monospace code block

### Guest view
- [x] All data renders for unauthenticated (optionalAuth) users via ProtectedRoute — same behavior as old page (GuestBanner shown by PageShell, data endpoints use lanOrAuth/optionalAuth on server)

### Data layer
- [x] No per-page setInterval — all data from useSnapshot() shared provider
- [x] Temp history fetched separately (not in snapshot) with own interval matching POLL_MS
- [x] AdGuard + backup fetched separately (not in snapshot yet) with own interval
- [x] Processes lazy-fetched on machine card expand
- [x] LAN detection (5s on LAN, 20s elsewhere)
- [x] 401 → localStorage clear + redirect to /login

### Missing / gaps
- [ ] LAN/WAN polling rate applied to snapshot provider — **implemented** (5s LAN, 20s WAN in SnapshotProvider)
- [ ] localStorage cache (rc/wc pattern) for offline-first skeleton — old page used cache; new page shows Skeleton while loading instead (acceptable: data arrives quickly from snapshot). Not a regression for UX.
- [ ] adguard + backup sections not yet in /api/snapshot — fetched separately with own intervals (will move to snapshot in a later sprint)
- [ ] Tailscale section in lab payload (`tailscale` key) — present in snapshot but not yet displayed (old page also didn't render it directly; carried in `data.services` object)

---

---

## ServicesPage + DockerSection Feature-Parity Checklist

**Sources:** `src/Pages/DashboardNew.tsx` + `src/Pages/DockerPage.tsx` → new `src/Pages/Services/`

### ServicesPage — Layout & Structure
- [ ] Guest banner (info box about URLs hidden in guest view)
- [ ] Search bar with magnifier icon; accent border on focus
- [ ] Status summary pill: "n/total up" with correct color dot (all-up=ok, all-down=err, partial=warn)
- [ ] Toolbar action buttons for authed users: Add (accent), Import/Export (Download icon), Settings (gear)
- [ ] Tag filter chip row — horizontally scrollable, scrollbar-none
- [ ] Pinned section with section label + hairline divider
- [ ] All Services section label (only shown when pinned section also exists)
- [ ] Empty state — no services: "Load JojeCo Services" seed button + "Add Manually" button
- [ ] Empty state — no match: "No services match your filter" + "Clear filters" link
- [ ] Collapsible Containers section below services (hairline divider top, chevron toggle, renders DockerSection when open)

### ServiceCard
- [ ] Borderless Card (surface elevation, shadow-ring + shadow-card; no explicit border color)
- [ ] Icon box (8×8 background raised, no hard border → use shadow-ring only)
- [ ] Status dot top-right (pulsing when online)
- [ ] Response time in monospace (t3)
- [ ] Name (13px, semibold, t1, truncated)
- [ ] Description (11px, t3, truncated)
- [ ] Tag chips (max 2, 9px, raised bg, t3, NO border — shadow-ring only or drop entirely)
- [ ] Uptime sparkline (7-day / 24 buckets) bottom-left
- [ ] Up/Down/— status label (color-coded)
- [ ] External link icon (t3→accent on hover)
- [ ] Click → open edit modal (not for guests)
- [ ] Offline card: red inset shadow stripe (j-card-err class) — NOT a red border color
- [ ] Hover: shadow-hover (no border change)

### Health Data
- [ ] On-mount + 60s interval: fetch `/services/health` via api.ts
- [ ] On-mount + 30min interval: fetch `/health/sparklines` via api.ts
- [ ] healthMap and sparklines populated from API responses
- [ ] NO per-card setInterval

### Service Mutations (modal-based, existing modals reused)
- [ ] Add service (ServiceModal, selectedService=null)
- [ ] Edit service (ServiceModal, selectedService=service)
- [ ] Delete service (serviceService.deleteService via ServiceModal onDelete)
- [ ] Pin/unpin (via ServiceModal → serviceService.updateService with isPinned toggle)
- [ ] Import services (ImportExportModal → serviceService.importServices)
- [ ] Export services (ImportExportModal → serviceService.exportServices)
- [ ] Seed default services ("Load JojeCo Services" → serviceService.seedDefaultServices)

### Settings Modal
- [ ] "Signed in as" email
- [ ] Change Password button → opens PasswordChangeModal
- [ ] App description + version footer
- [ ] Guest view: settings button hidden

### DockerSection (replaces standalone DockerPage in collapsible area)
- [ ] Stat tiles row: Running (ok), Stopped (err if >0), Stacks (accent), Images (t2)
- [ ] Unhealthy alert banner (red bg, err dot, count)
- [ ] Search bar — filters by name, image, compose_project
- [ ] Sort buttons: state | name | created (accent active state)
- [ ] Checkboxes: "Group by stack" + "Show stopped"
- [ ] Container count + Refresh button
- [ ] Container list grouped by compose stack (StackGroup) OR flat list
- [ ] StackGroup: collapsible, stack icon (Layers=accent/Box=t3), running/total count, unhealthy warning
- [ ] ContainerRow: state dot (ok/err/warn/off), name, HealthBadge, image, port chips, timeSince created
- [ ] Action buttons for authed: Restart (warn), Stop (err) for running; Start (ok) for stopped
- [ ] Log viewer: toggle via Terminal icon, log search, match count, green pre block, max-h 256
- [ ] Polling: 8s interval within the section via local fetch (not snapshot; docker containers in snapshot are summary only)
- [ ] localStorage cache key `cache_docker_containers` (warm on load)
- [ ] Empty state: Box icon + "No containers found"
- [ ] Error state: centered err-color message

### Mobile (390px)
- [ ] Service grid: 2 columns (minmax 140px with 8px gap fills to 2 on 390px)
- [ ] Tag row scrolls horizontally without showing scrollbar
- [ ] Docker stat tiles: 2×2 grid on mobile
- [ ] ContainerRow: ports hidden or wrapped on mobile (no overflow)
- [ ] Log panel does not overflow screen width
- [ ] Bottom nav safe-area respected (padding-bottom: env(safe-area-inset-bottom))

### Design compliance
- [ ] No explicit `border` / `borderColor` on cards — elevation only (shadow-ring)
- [ ] Section labels: 10-11px uppercase muted (var(--t3)), font-weight 700, letter-spacing 0.08em
- [ ] Status colors ONLY on status content (dots, labels, numbers)
- [ ] Hairline dividers: `1px solid var(--line)` (rgba 6% max) only for structural separation
- [ ] Tag chips in ServiceCard: NO border — use shadow-ring or drop border
- [ ] All numbers: font-variant-numeric tabular-nums, Geist Mono where prominent

---

## Media + Torrents Page Feature-Parity Checklist

**Sources:** `src/Pages/MediaPage.tsx` + `src/Pages/TorrentsPage.tsx` → new `src/Pages/Media/`  
**Routes:** `/media` and `/torrents` both render `MediaAndTorrentsPage` wrapper in App.tsx.

### Parity: 40/40

#### Torrents — Transfer Stats (4 tiles)
- [x] Download speed tile (↓ /s, accent)
- [x] Upload speed tile (↑ /s, ok)
- [x] Session DL total tile (t3)
- [x] VPN / connection status tile (Wifi/WifiOff icon, ok/warn)

#### Torrents — Tab Bar (3 tabs)
- [x] In Progress tab (active downloads, stalled, queued)
- [x] Completed tab (seeding, done)
- [x] Errors tab (error, missingFiles)
- [x] Per-tab count badge
- [x] Underline indicator on active tab

#### Torrents — Toolbar
- [x] Per-page selector (5/10/25)
- [x] Add torrent button (authed only) — accent
- [x] Select all / Deselect all button
- [x] Bulk pause (active tab), resume (done tab), recheck, delete buttons when selection > 0
- [x] Selected count label
- [x] Refresh button (right-aligned)

#### Torrents — Add Torrent Form
- [x] Magnet/URL input (expanded on button press, Enter to submit)
- [x] Submit + Cancel buttons

#### Torrents — Torrent List
- [x] Mobile: card layout (progress bar full-width, speed chips below)
- [x] Desktop: same card layout (dense table deferred — cards are per-spec for mobile-first)
- [x] Per-torrent: name, state label (color-coded), size, ETA (if downloading)
- [x] Progress bar (color by tab: accent active, ok done, err error)
- [x] Speed: ↓ dlspeed/s and ↑ upspeed/s if nonzero
- [x] Seeds/leechers count
- [x] Click-to-select (border-color highlight when selected)
- [x] Per-row action bar: pause/resume (context-sensitive), recheck, delete (ConfirmDialog)
- [x] Pagination (prev/next/page numbers)

#### Torrents — Data
- [x] Fetch `/api/torrents/list` on mount + after mutations + on snapshot refresh
- [x] Transfer stats from `useSnapshot('torrents')` (avoids duplicate setInterval)
- [x] No setInterval in page — snapshot handles cadence
- [x] Error state when API unreachable
- [x] Loading skeleton / spinner

#### Media — CD Rip Status
- [x] RipCard shown only when rip.status !== 'idle'
- [x] Album name + spinning Disc icon (ripping state)
- [x] Track progress bar + track/total + percent
- [x] Status badge (ripping/importing/done/error/starting) color-coded
- [x] Rip status fetched via GET `/api/rip/status` on mount + snapshot refresh cadence

#### Media — Transcoder (Tdarr)
- [x] Library Score / Transcoded / In-Queue or Errors / Space Saved stat tiles
- [x] HEVC Coverage progress bar + legend (Already HEVC / Transcoded / Errors / Health errors)
- [x] Active workers list: type badge (GPU Transcode/CPU), node name, fps, filename, per-worker progress bar
- [x] "No active workers" empty state
- [x] "Tdarr unavailable" graceful null state
- [x] Tdarr data fetched via GET `/api/tdarr/status` on mount + snapshot refresh cadence

#### Media — Download Queue (Sonarr + Radarr)
- [x] Source tab bar: All / 📺 Sonarr count / 🎬 Radarr count
- [x] Per-page selector (5/10/25)
- [x] Refresh button
- [x] Sorted by progress descending
- [x] Per-item card: type icon (TV/Film), title (show: Series — SxxExx EpTitle; movie: Title (Year)), status badge
- [x] Progress bar (size - sizeleft / size) + size labels + percent
- [x] Time-left display (Clock icon, hidden when 00:00:00)
- [x] Tracked download warning (AlertCircle, hidden when Ok)
- [x] Empty state (CheckCircle icon)
- [x] Pagination
- [x] Data from `useSnapshot('media')` — no extra fetch needed

#### Media — Upcoming Calendar
- [x] Source tab bar: All / 📺 episodes count / 🎬 movies count
- [x] Per-page selector (5/10/25)
- [x] Episodes sorted by airDate ascending
- [x] Movies sorted by digitalRelease → physicalRelease → inCinemas ascending
- [x] All-tab: interleaved chronologically
- [x] Per-episode card: TV icon (accent), series name, episode (SxxExx — title), network, date badge (Today/Tomorrow/in Nd/Nd ago)
- [x] Per-movie card: Film icon (purple), title (year), studio, release type (Digital/Physical/In Cinemas), date badge
- [x] Empty state text
- [x] Pagination
- [x] Data from GET `/api/media/upcoming` on mount + snapshot refresh cadence

#### Design System Compliance
- [x] Surface elevation (j-panel) — no white/hard borders
- [x] Hairlines only: `1px solid var(--line)` for structural dividers
- [x] Section labels: 10px uppercase t3, 0.08em letterSpacing + hairline rule (SectionLabel from Controls/)
- [x] Status colors ONLY on status content (dots, badges, state labels)
- [x] Destructive delete: ConfirmDialog from Controls/ (lifted to components/ or imported)
- [x] `minWidth: 0` on every grid/flex item — prevents 390px overflow
- [x] Progress bars have `overflow: hidden` wrapper track
- [x] Torrent name: `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap` (single-line in card)
- [x] No setInterval in page component — useSnapshot + on-demand fetches only
- [x] Mobile-first: single-column stack at 390px, bottom-nav safe-area gap

---

## MinecraftPage Feature-Parity Checklist

**Source:** `src/Pages/MinecraftPage.tsx` (267 lines) → new `src/Pages/Minecraft/`

### Parity: 14/14

#### Header
- [x] Server icon + "Minecraft" title + subtitle "Server 1 · 192.168.50.10"
- [x] API connectivity indicator (Wifi / WifiOff) top-right
- [x] Refresh button (on-demand, triggers snapshot.refresh or re-fetch)

#### Server Cards (one per server returned from API)
- [x] Server name (fontWeight 700) + port in monospace (t3)
- [x] StatusBadge: running=ok, starting=warn, stopped=t3 — pill with dot + label
- [x] Players row: Users icon, comma-joined player names if online, "No players online" otherwise
- [x] Start button — disabled+dimmed when NOT stopped, confirm dialog before firing
- [x] Stop button — disabled+dimmed when stopped, confirm dialog before firing
- [x] Restart button — disabled+dimmed when stopped, confirm dialog before firing
- [x] Loading spinner state per button key (`${id}_${act}`)
- [x] Logs toggle button — on click fetches `/logs/:id` and expands log viewer; click again to hide
- [x] Errors toggle button — on click fetches `/errors/:id` and expands log viewer in err color; click again to hide
- [x] Log/error viewer panel (mono, max-height 280, overflow-y scroll)

#### Data
- [x] Status via `useSnapshot('minecraft')` — no setInterval in component
- [x] On-demand refresh after successful start/stop/restart (500ms delay then snapshot.refresh)
- [x] API down state → full-page empty card with WifiOff icon + help text

#### Status summary footer
- [x] Running/starting/stopped counts + "Refreshes every Xs" label (snapshot cadence)

#### Design System Compliance
- [x] Surface elevation only — no white/hard borders
- [x] 10px uppercase section labels with hairline rule
- [x] Status color only on status dots/badges
- [x] minWidth: 0 on all grid/flex items
- [x] mobile-first — cards stack to single-column at 390px
- [x] ConfirmDialog for start/stop/restart (destructive server actions)
- [x] ToastStack for mutation feedback
- [x] No setInterval in page — useSnapshot cadence only

---

## ChaosPage Feature-Parity Checklist

**Source:** `src/Pages/ChaosPage.tsx` (636 lines) → new `src/Pages/Chaos/`

### PUBLIC ROUTE — Renders logged-out (no ProtectedRoute). Uses optionalAuth endpoints.

### Parity: 24/24

#### Header
- [x] "ChaosMonkey" title + mode chip (LIVE/SIMULATION IDLE/SIMULATION RUNNING/REAL MODE/REAL RUNNING)
- [x] Subtitle: polled time (live), "Simulated chaos demo" (sim), agent connected/disconnected (real)
- [x] Mode button set: LIVE → [↺ REFRESH, SIMULATE, REAL CHAOS]; SIM → [RESET, LAUNCH SIM, EXIT SIM]; REAL → [EXIT REAL]

#### Stats Row
- [x] HEALTHY / DEGRADED / DOWN / TOTAL counts (Geist Mono, color-coded)

#### Service Grid
- [x] Grouped by category (Core/Media/Storage/AI/Monitoring/Comms) with section labels
- [x] Per-service card: name, status dot + label (HEALTHY/DEGRADED/DOWN/UNKNOWN), latency, dependsOn list
- [x] Degraded/down services: colored border highlight (STATUS_DIM bg or shadow)
- [x] Grid auto-fill minmax(200px, 1fr) → wraps to single column on 390px

#### Dependency Map
- [x] Renders edge list: from-service ──▶ to-service, colored by status
- [x] Hidden when no edges

#### Simulation Mode
- [x] SIM_SCRIPT hardcoded in component (not fetched) — runs via setTimeout array
- [x] Reset clears timers + resets services to live snapshot copy
- [x] Launch runs all steps in sequence (no re-launch while running)
- [x] Exit clears timers, returns to live mode

#### Real Mode
- [x] Agent status panel: ONLINE/OFFLINE chip, module count
- [x] Module selector chips (redis-probe, port-scan, dep-kill)
- [x] Module description hint text
- [x] Target input with per-module placeholder
- [x] Dry run toggle chip (DRY RUN=safe / LIVE RUN=warn)
- [x] RUN button → POST `/api/chaos/agent/run/:module` (Authorization header from getToken — may be null for guest, but guest can't reach real mode without agent being online; endpoint uses optionalAuth)
- [x] ABORT button (visible while running) → POST `/api/chaos/agent/abort`
- [x] **ConfirmDialog required** before RUN and ABORT (added in v3 — old page had no confirm)

#### Log Panel (sim + real modes)
- [x] "ATTACK LOG" (sim) / "AGENT LOG" (real)
- [x] Entry count
- [x] Per-entry: timestamp + colored message (info/warn/crit/ok color mapping)
- [x] Auto-scroll to bottom on new entries (useEffect on logs array)
- [x] Blinking cursor (▊) while running
- [x] "Awaiting chaos launch..." / "Select a module and run..." empty states

#### Service Polling
- [x] `GET /api/chaos/services` on mount — public, no auth required
- [x] Re-poll on manual REFRESH click
- [x] **Interval rationale:** /chaos is a PUBLIC route not covered by SnapshotProvider's auth flow; the snapshot provider redirects 401 → /login which would break the public view. A page-level 30s interval for `poll()` is kept (matches old behavior) because this is the only endpoint safe to hit unauthenticated without risking auth redirect. Documented here.
- [x] Agent status polling 10s (only when mode === 'real') — uses getToken() which returns null for guests; agent endpoint returns 401 for unauthenticated which is caught and sets agentOnline=false

#### Guest / Public View
- [x] Page renders fully without auth token (LIVE mode, sim mode work unauthenticated)
- [x] Real mode reachable from UI but agent will show OFFLINE if auth fails
- [x] No ProtectedRoute wrapper preserved in App.tsx

#### Design System Compliance
- [x] Surface elevation only — no white/hard borders; status-colored border on degraded/down service cards
- [x] Hairlines: 1px solid var(--line) for panel separators
- [x] Section labels: 10px uppercase + hairline rule
- [x] Status color only on dots, labels, numbers
- [x] minWidth: 0 on all grid/flex items
- [x] mobile-first — service grid wraps to 1 column at 390px
- [x] ConfirmDialog for RUN module + ABORT (v3 adds confirm for RUN/ABORT that old page lacked)
- [x] ToastStack for real-mode errors

---

## Phase 2 — Speed

- [ ] SSE stream from API: `GET /api/events` — server push replaces client polling
- [ ] Single `useLabStream` hook subscribes; all pages read from shared cache
- [ ] Server-side SSH/HTTP fan-out cache (one loop, not per-request)

---

## Phase 3 — Backend Refactor

- [ ] Split server.js (2875 lines) into route modules
- [ ] sql.js → better-sqlite3 (WAL mode, no data-loss on crash)
- [ ] Delete dead server/index.js

---

## Phase 4 — Features

- [ ] Alert center UI (ntfy → /api/alerts/recent)
- [ ] Global command palette (⌘K)
- [ ] Prune /ai route

---

## Known Issues / Notes

- `docker-compose.staging.yml` has `version: '3.8'` which Docker warns is obsolete — harmless
- Tailwind `darkMode: ['class']` is wired; theme toggle sets `.dark`/`.light` on `<html>` + legacy `data-theme` attr simultaneously so both CSS systems work during porting
- badge.tsx uses direct color classes (green-500, red-500) for status variants rather than CSS vars — refine during page porting
- `@types/node` added as devDep for vite path.resolve(__dirname) — required
- No SVG icon generation needed — prod already has icon-192.png + icon-512.png
