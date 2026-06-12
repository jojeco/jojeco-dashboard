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
