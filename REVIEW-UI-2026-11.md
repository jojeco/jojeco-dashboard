# UI/UX Review — dash.jojeco.ca/v4 (`redesign-v5`) — 2026-11

Scope: every page and shared component under `src/v4/` (and the hooks they rely on), checked against `DESIGN.md` and Jordan's design goals: a dark control room, mobile-first, no light borders, and a button for every admin action. No application code was changed. Home was also rendered headless with mocked API data at 1920×1080, 1440×900, 1280×720, 1100×800 and 390×844 to confirm the layout findings.

---

## 1. Executive summary

1. **Home's viewport-locked grid hides data on desktop.** Hosts, Services and Storage panels use `overflow:hidden` and have no inner scroll. At 1440×900 the offline host (the one row you need to see) was cut off, and Storage showed 383 of 1102 px.
2. **Several screens show a healthy state they don't actually know.** Kiosk shows "HEALTHY" when its fetch fails, the Claude-on-CT100 card is always green, Jarvis is always "ONLINE", and Plex and Downloads read "idle" or "no streams" when the API is down. Several error paths also leave buttons stuck spinning.
3. **The control-panel goal isn't met yet.** Media is read-only: no pause, delete, retry or search. Services can never show or Start a stopped container (`?all=0`). Updates "Apply" never tracks its job. Printer spools can't be edited even though the API supports it.
4. **There are no keyboard focus styles anywhere.** That combines with icon rail links that have no accessible name, 49 instances of text under 10 px, and many tap targets of 18–40 px. On a phone-first app these are the biggest accessibility gaps.
5. **The build passes once deps are installed, but the toolchain is fragile.** `npm ci` fails (the lockfile is gitignored, yet the Dockerfile runs `npm ci`), there is no ESLint config, and the v4 chunk is 644 kB. Polling never pauses in hidden tabs, and the snapshot context re-renders the whole app on every SSE tick.

---

## 2. Top 10 highest-impact issues (ranked)

### 1. Home desktop panels clip content with no way to scroll
- **Where:** `src/v4/v4.css:410-436`; `HomePageV5.tsx:53-86`; `HostTileD.tsx:553-598`; `ServiceHealthSummary.tsx:30`; `StoragePanel.tsx:326`.
- **What's wrong:**
  - From 1280 px up, each `.v5-col .v5-panel` is `flex:1 1 0; overflow:hidden`, but no child scrolls.
  - Measured `clientHeight/scrollHeight`: Storage was 383/1102 at 1440×900 and 293/1102 at 1280×720. Services was 293/393 at 1280×720.
  - With 8 lab hosts, the 7th and 8th rows (including the **offline** Pi4) were cut off. Only a red stripe sliver showed.
  - `grid-template-rows: 62fr 38fr` / `42fr 58fr` (`v4.css:417, 427`) does nothing because `.v5-col` is `display:flex`. Every column splits 50/50.
- **Fix:**
  - Make `.v5-col` a grid at ≥1280 px: `display:grid; grid-template-rows: 62fr 38fr` and so on. Its children get `min-height:0`.
  - Give each panel a fixed header plus a `flex:1; min-height:0; overflow-y:auto` body, using the same pattern as `LiveDownloadsPanel.tsx:274`.
  - Sort offline and degraded hosts to the top of `HostTileDPanel` so they never fall below the fold.

### 2. Updates "Apply" never tracks its job and reports success at once
- **Where:** `src/v4/components/UpdatesPanel.tsx:274`, `:183-193`, `:288`.
- **What's wrong:**
  - `doApply` starts `setInterval(pollJobStatus)` with the closure from when `applyJobId` was still `null`. That closure returns early on every tick.
  - The effect at 184 then sees `pollRef.current` already set and never creates a working interval. The interval also leaks on unmount.
  - `jobDone = jobStatus?.finishedAt !== null` is `true` while `jobStatus` is `null`, so the UI says "Apply complete" before anything has run.
- **Fix:**
  - Delete line 274. Let one effect own the interval: `useEffect(() => { if (!applyJobId) return; const t = setInterval(poll, 3000); return () => clearInterval(t); }, [applyJobId, poll])`.
  - Change the done check to `jobDone = jobStatus != null && jobStatus.finishedAt != null`.

### 3. No keyboard focus styles, and unlabeled icon navigation
- **Where:** `src/v4/v4.css` (no `:focus-visible` rule; `focus-visible` appears once in all of v4); `AppShell.tsx:124-144`, `:295-305`.
- **What's wrong:**
  - Almost every button sets `border:none` inline and has no focus ring, so keyboard users can't see where they are.
  - In the 56/64 px icon rail the label span is `display:none`, so each nav `<Link>` has no accessible name. `title` doesn't count reliably.
  - The "More" button lacks `aria-expanded` and `aria-haspopup`, and its menu doesn't close on Escape.
  - Active links lack `aria-current="page"`.
  - There is no `prefers-reduced-motion` handling for the stagger, spring, pulse and shimmer animations.
- **Fix:**
  - Add `.v4-root :focus-visible { outline:2px solid var(--v4-amber); outline-offset:2px; }` to v4.css.
  - Add `aria-label={tab.label}` and `aria-current={active ? 'page' : undefined}` to the rail and bottom-nav links.
  - Add `aria-expanded={moreOpen}` to More, plus a `keydown` Escape handler.
  - Add `@media (prefers-reduced-motion: reduce) { .v4-root *, .v4-root *::before { animation:none!important; transition:none!important } }`.

### 4. Screens show "healthy" or "idle" when they actually have no data
- **Where:**
  - `KioskPage.tsx:518`: `data.lab?.status ?? 'healthy'`.
  - `ControlsPage.tsx:823`: the Claude card stripe is hardcoded `var(--v4-nominal)`.
  - `JarvisPage.tsx:102-103`: "JARVIS ONLINE" is hardcoded.
  - `GamingPage.tsx:500/558/593`: missing snapshot is treated as "S1 offline" and pushes the Wake button.
  - `MediaPage.tsx:464-467`: a Tautulli failure reads "No active streams".
  - `LiveDownloadsPanel.tsx:252, 275`: the dot is always green and the panel shows "idle" before the first fetch or when both APIs fail.
  - `LiveIndicator.tsx:26-31`: "closed" and "reconnecting" use the same grey as syncing.
- **What's wrong:** On a monitoring dashboard, a false green is the worst failure mode.
- **Fix:**
  - Add a third state everywhere: `unknown`, shown in Standby colour with "NO DATA" or "—".
  - Drive the Claude and Jarvis status from real endpoints.
  - Give the downloads panel `loading` and `error` states: a skeleton first, and a Fault dot when both sources error.
  - Colour `closed` with `--v4-fault` in LiveIndicator.

### 5. Errors leave the UI stuck or loop the network
- **Where:**
  - `ControlsPage.tsx:430, 448`: raw `fetch` for failover activate/deactivate with no try/finally.
  - `AlertHistoryModal.tsx:141-145`.
  - `ContainerLogTail.tsx:37-63`.
  - `JobsPage.tsx:60-71`.
  - `KioskPage.tsx:272-483`.
- **What's wrong:**
  - In Controls, a network error means `setLoad(..., false)` never runs, so the button stays on "Activating…" for good.
  - In AlertHistoryModal, when a load fails, `alerts` stays `null` and `loading` returns to false, so the effect calls `load()` again in a **tight retry loop** for as long as the modal is open.
  - ContainerLogTail has no try/catch, so its skeleton stays up forever.
  - Jobs never checks `res.ok`, so a failure shows "No jobs in this view".
  - Kiosk cards show "Loading…" with a spinner forever.
- **Fix:**
  - Wrap every action in `try { … } finally { setLoad(id, false) }`.
  - Gate the AlertHistoryModal effect on `!failed` and add a Retry button.
  - Use a standard `{data, loading, error}` shape with an inline "Unreachable · Retry" row. Consider a small `useResource(fetcher, {pollMs})` hook so every page handles this the same way.

### 6. Services can't show or start stopped containers, and nothing refreshes after actions
- **Where:** `ServicesPage.tsx:753` (`/docker/containers?all=0`; the server only includes stopped containers when `all=1`, see `server/routes/docker.js:14`); `:447-453`; `:135-219`.
- **What's wrong:**
  - The "+N stopped" toggle always shows +0, so the **Start** button can never be reached.
  - After Restart, Stop or Start, the list isn't re-fetched, so buttons show the old state for up to 15 s.
  - The service detail modal shows the container but has no actions.
- **Fix:**
  - Fetch `?all=1` and keep the client-side filter.
  - Pass `refetch()` into the action handlers.
  - Render `<ContainerActions>` inside the service detail modal.

### 7. Media page is read-only and freezes after the first load
- **Where:** `MediaPage.tsx:1476-1485` (torrents, Tdarr, upcoming and arr stats are fetched once); `:298-355` (TorrentDetailModal); `:1000-1290` (arr panels); `:1127-1136` (missing counts).
- **What's wrong:**
  - Only Plex polls. Torrent speeds and ETAs freeze, and there is no refresh control.
  - There are no admin actions anywhere on the page. That goes against the "every manual admin action has a button" intent.
- **Fix:**
  - Poll torrents every ~5 s and Tdarr every ~15 s, with the visibility pause from #10. Add a refresh icon button with an `aria-label`.
  - Add action footers:
    - Torrents: Pause, Resume, Recheck, Delete. Delete gets a Fault-ghost button and a confirm that names the item.
    - Arr queue: Retry import, Remove + blocklist.
    - Missing counts: "Search missing".
    - Tdarr: Requeue errors.
  - Add the same Pause/Resume SAB and qBit controls to Home's Downloads header.

### 8. Controls and Media mount both layouts at once, and Controls re-renders every second
- **Where:** `ControlsPage.tsx:507` and `:554`, `MediaPage.tsx:1531` and `:1560` (`xl:hidden` vs `hidden xl:grid`); `ControlsPage.tsx:271-275` (1 s `now` ticker); `:504` (inline `onDismiss`) with `ToastBanner :198-203`.
- **What's wrong:**
  - Each panel mounts twice. `UpdatesPanel` polls twice with two confirm modals, and tab and selection state is lost when the viewport crosses 1280 px.
  - The 1 s ticker re-renders both trees forever, even in a hidden tab.
  - Each re-render creates a new `onDismiss`, which resets the toast's 4.5 s timer, so **the toast never auto-dismisses**. It also has no close button.
- **Fix:**
  - Render one tree and rearrange it with CSS grid areas or `order-*`, or use a `useMediaQuery('(min-width:1280px)')` switch.
  - Move elapsed time into an `<Elapsed since>` leaf that ticks only while something is running.
  - Use `useCallback(() => setToast(null), [])`, add a dismiss button, and add `role="status" aria-live="polite"`.

### 9. App-wide re-render churn and polling hygiene
- **Where:**
  - `src/hooks/useSnapshot.tsx:165`: a new context value object on every provider render.
  - `src/hooks/useLabStream.ts:108`: `loadFromCache()` runs `JSON.parse` on up to 1.5 MB of localStorage **on every render**, not only the first.
  - 11 `setInterval`s in v4 and none check `document.visibilityState`: `LiveDownloadsPanel.tsx:218` (2 endpoints every 5 s), `ClaudeTerminalViewer.tsx:49` (5 s), `PrinterPage.tsx:52`, `MediaPage.tsx:1483`, `ServicesPage.tsx:770`, `ControlsPage.tsx:273/303/311`, `AppShell.tsx:50`, `KioskPage.tsx:513`, and `UpdatesPanel`.
  - `AppShell` mounts `AcTemps`, `LabStatusSummary`, `AlertBell` and `LiveIndicator` in both the mobile header and the desktop chrome, which are hidden with CSS. That doubles the `/ac/status` polling.
- **What's wrong:**
  - Every SSE tick re-renders every `useSnapshot` consumer and re-parses the cache.
  - All the polling keeps running on a backgrounded iPhone tab, which costs battery and server load.
- **Fix:**
  - Use `useState(() => loadFromCache())` (a lazy initializer).
  - `useMemo` the context value, or split it into per-section contexts or a `useSyncExternalStore` selector so `useSnapshot('gaming')` only re-renders on gaming changes.
  - Add a shared `useVisibleInterval(fn, ms)` that skips ticks while the tab is hidden and refetches on `visibilitychange`. useLabStream already has this pattern.
  - Render the header widgets once and choose placement with CSS.
  - In LiveDownloadsPanel, back off to 30 s after an error.

### 10. Downloads panel shows duplicate rows; Primitives drop styles
- **Where:**
  - `LiveDownloadsPanel.tsx:84` and `:224-227`.
  - `Primitives.tsx:14-16, 27-29, 40-42, 54-56, 71-77`.
  - `PrinterPage.tsx:253-256`.
- **What's wrong:**
  - `queuedDL` and `checkingDL` are in `ACTIVE_QBIT_STATES` and are **also** added again by `qbitQueued`. Every queued torrent shows twice with a duplicate React key. Confirmed in the render: `linux.iso` appears twice.
  - Each primitive merges `style={{base, ...props.style}}` and then spreads `{...props}`, so any caller `style` replaces the base. For example, `<Panel style>` loses its background and `<Mono trace style>` loses the trace colour.
  - In PrinterPage, Mono's inline colour beats the `text-[var(--v4-fault)]` class, so weight warnings never show colour. "Low" also uses `--v4-amber`, which is the *blue* accent.
- **Fix:**
  - Use `const qbitRows = qbitList.filter(t => ACTIVE_QBIT_STATES.has(t.state)).map(qbitToRow)`.
  - Destructure `style` out before spreading: `({ style, ...props }) => <Tag {...props} style={{ base, ...style }}/>`.
  - Pass the printer colours through `style`, and use `--v4-degraded` for the low band.

**Honourable mentions:**
- Light-border violations in ToolsPage and PrinterPage (§3).
- KioskPage uses its own palette (§3).
- Jarvis recording breaks on iOS Safari (§3).

---

## 3. Per-page findings

### Global / AppShell / tokens
- **Breakpoint mismatch.** Tailwind `lg` is the default **1024 px**, but the v5 CSS keys on 1280 and 1440 (`v4.css:317, 324, 388`). Between 1024 and 1279 px the rail shows, but Home is a single stretched column (rendered at 1100 px: a 2624 px tall page). Between 768 and 1023 px tablets get the phone layout.
  - Fix: add `screens: { lg: '1280px', xl: '1440px' }` to `tailwind.config.js` to match the CSS, and give Home a 2-column layout at `md`/`lg`.
- **Rail labels sit against their icons at ≥1440 px.** The inline `gap: 0` (`AppShell.tsx:137`) overrides the `.v5-rail-item { gap:10px }` rule. Remove the inline `gap`. Visible in the 1440 screenshot.
- **Logo shows as "J ojeCo".** The brand is split into two spans with `ml-1.5` (`AppShell.tsx:115-116`). Render "JojeCo" as one label at xl and "J" when collapsed.
- **Jarvis is unreachable from navigation.** It is missing from `TABS` (`AppShell.tsx:20-29`), so `/v4/jarvis` highlights Home because `useActiveTab` falls back to it. Add it to TABS (under More on mobile), and match active tabs with `pathname.startsWith`.
- **Sign out runs on a single click** with no confirm and no focus style (`AppShell.tsx:155-163`). It's low risk, but it sits next to the alert bell.
- **Bottom-nav labels are 9.6 px** (`text-[0.6rem]`, `AppShell.tsx:287, 297`). Raise them to `0.6875rem`.
- **`AC_API` falls back to `http://localhost:3001`** (`AppShell.tsx:37`). There are 8 different API base fallbacks across v4, including `192.168.50.13:3001` in Gaming and Updates. Export one `API_BASE` and an `authFetch()` from `services/api.ts`.
- **Token naming and literals.**
  - `--v4-amber` is blue (`v4.css:24`). Aliases exist (`--v4-blue`, `--v4-accent`), but most code still says amber, which has already caused bugs (Printer, GamingPage:387). Rename it and leave `--v4-amber` as an alias.
  - There are about 125 raw `rgba(…)` literals in v4 TSX. Switch to `color-mix(in srgb, var(--v4-…) N%, transparent)` and add `--v4-accent-wash` / `--v4-fault-wash` tokens.
- **Dead CSS.**
  - `.v4-command-grid` (`v4.css:145-153`) and the whole react-grid-layout block (`:233-293`) are unused. The `react-grid-layout` package isn't even a dependency.
  - The "v5 Desktop Layout Additions" header is duplicated (`:294, :300`).
  - The comment "40% | 30% | 30%" next to `5fr 3fr 4fr` is wrong.
- **Duplicate font imports.** Fonts load in both `main.tsx` and `v4.css`. Keep one.
- **Text under 10 px appears 49 times** (`0.5rem`, `0.5625rem`, `0.6rem`, `0.625rem`). DESIGN asks for legibility on an iPhone, so set a floor of `0.6875rem`, with `--v4-trace` as the dimmest colour.
- **Panel title size doesn't match DESIGN.** `PanelTitle` is 0.75rem, while DESIGN §3 says 0.875rem. Decide which is right and update the other.
- **`Panel` nesting.** It uses a 1rem radius inside a `.v5-panel` with 0.75rem, so two backgrounds stack. Let `.v5-panel` be the surface and render children as transparent.

### Home (`HomePageV5`)
- **Clipping and the dead row ratios:** see Top #1.
- **The "Personal rigs" group never renders.** `HomePageV5.tsx:42` filters personal machines out with a *substring* match, then passes `secondaryIds` (`:61`) to `HostTileDPanel`, which uses *exact* matching. Pass all machines and let the panel group them, with one shared `isPersonal()` in `lib/utils`. StoragePanel's copy of the list (`StoragePanel.tsx:19`) uses exact matching too.
- **Disk thresholds disagree.** HostTileD colours disks at 85/90 % (`HostTileD.tsx:107-112`), but StoragePanel uses 75/90 % (`StoragePanel.tsx:30-33`). The same disk can be white in one panel and amber in the other. Use one `diskLevel()` helper.
- **HostTileD rows:**
  - Hover is driven by React state (`:282, :297`), so every hover re-renders. Use CSS `:hover`.
  - `pts={[...pts]}` (`:316`) creates a new array each render, so the canvas repaints on every parent render.
  - The inline `<style>` (`:543-551`) duplicates the keyframes already in `v4.css:227-231`.
  - Offline rows at `opacity:0.45` (`:292`) push `--v4-readout` text below 3:1 contrast.
  - The `aria-label` (`:312`) replaces the content, so screen readers hear "S1 — online" but not CPU, RAM or disk.
  - Fix:
    - Use CSS hover.
    - Pass `pts.length` as the dependency.
    - Drop the inline style.
    - Dim offline rows only on the stripe and dot, and keep text at `--v4-readout`.
    - Extend the label with the metrics.
- **Gaming glance:**
  - It returns `null` until the snapshot arrives (`GamingGlance.tsx:63`), so the panel is a blank box. Render a skeleton.
  - Palworld is ignored even though it is in `GamingSection`. Add a row for it.
  - At 1440×900 the panel is about 60 % empty. Give the spare height to Storage (`42fr/58fr` once the grid works), or add quick Start/Sleep buttons.
  - The `role="button"` section has no focus style.
- **Downloads:**
  - Duplicate rows (Top #10) and false idle (Top #4).
  - `NZB`/`TRK` badges are 8 px with 0.22–0.28 alpha borders (`LiveDownloadsPanel.tsx:126-131`). Drop the border, keep the wash, and use 0.625rem or larger.
  - There are no Pause/Resume controls.
- **Services summary:**
  - "All →" is about 18 px tall (`ServiceHealthSummary.tsx:33-39`). Use `min-h-[44px]`.
  - The empty copy "No service data / Check API connectivity" is fine, but there is no Retry.
- **Mobile (390×844):**
  - The page is 2968 px tall and Storage alone is about 1100 px.
  - DESIGN §5 wants alerts → hosts → services → automation → controls on mobile, and Home has no quick controls at all.
  - Collapse Storage to "fullest 3 drives + Show all", cap Downloads at 5 rows with "+N more", and add a quick-actions row (Restart Plex, Wake S1, Pause downloads).
- **Alert strip** (`AlertStrip.tsx:104-105`):
  - `role="alert"` on a `<button>` overrides the button role, and the `aria-label` hides the issue text.
  - Tapping opens 48 h history rather than the failing service.
  - Use a `role="status"` wrapper and link each issue to `/v4/services`, with a restart action.

### Services (`ServicesPage`)
The tokens, stripes, skeletons and confirm step here are closest to the spec. The problems:
- **Containers and actions:** Top #6.
- **Any polling error replaces the whole grid** with "Docker API unavailable" (`:695`). Keep the last data and add a "stale · Retry" chip.
- **The skeleton never ends** if SSE never delivers (`:833`). Time out to an EmptyState after about 10 s.
- **Small tap targets.** `:675-684` and `:787-796` are text toggles with `padding:0` (about 18 px), and `:488/:496` are 40 px buttons.
- **`ServiceGroupDetailModal` copies `ServiceRow` without interaction** (`:20-61`). It treats unknown as DOWN (`:15, 21, 72`). Share the row component and use Standby for unknown.

### Media (`MediaPage`)
It looks finished but works like a snapshot.
- **Stale data and no actions:** Top #7.
- **Both layouts are mounted:** Top #8.
- **Purple is used outside the palette.** `#a78bfa` appears at `:210, 396, 953, 1082, 1245`, and DESIGN bans purple. Use `--v4-readout`.
- **Width transitions** at `:321, 364, 522` animate `width`. Use `transform: scaleX()`.
- **Error states are missing.** Tdarr shows "Unavailable" before its first fetch (`:1446-1474`). The Upcoming section disappears when empty (`:1142`).
- **Mobile header crowding.** The Arr header (`:1122-1138`) and Downloads header (`:630-644`) crowd at 375 px. Add `flex-wrap gap-y-1`.
- **Dead ternary** at `:1329` (`grid-cols-4 : grid-cols-4`). Use `grid-cols-2 sm:grid-cols-4`.
- **Scroll inside scroll.** Nested 400 px scroll boxes (`:1197, :1267`) create two scroll areas on mobile.
- **ESLint references a rule that doesn't exist.** The disable comments at `:1488-1495` name `@typescript-eslint/no-explicit-any`, which isn't loaded.

### Controls (`ControlsPage`)
This page has the best action coverage, but:
- **The ticker, toast and double mount:** Top #8.
- **Stuck failover buttons:** Top #5.
- **The Claude card is always green:** Top #4.
- **Confirm styling and coverage.**
  - "Restart Claude" confirms with a non-destructive green button (`:384`), but DESIGN says restart uses Fault styling.
  - Sync Volumes and Abort fire without a confirm (`:459-464`, `:412-420`), even though the header says every action requires one.
  - Runbook confirms use generic copy (`:392`). Name the target.
- **`Activate Failover` stays enabled** while failover is already active or its state is unknown (`:1233-1241`).
- **Server cards are tall on phones.** `:646-649`, `:760-788`: each card stacks 3 full-width buttons, about 1300 px for 6 servers. Below `sm`, use a 3-up icon+label row.
- **Small tap targets.** `min-h-[36px]` at `:890, 900, 1043, 1053, 1127, 1137` and 40 px at `:938, 1234-1266`.
- **Copy-pasted code.** Trigger rows are duplicated at `:865-910` and `:1018-1063`. Extract `<TriggerRow>`, `<RunBtn>` and `<AbortBtn>`, plus one shared `<ConfirmModal>` that UpdatesPanel (`:329-350`) and GamingPage can also use.
- **`unresponsive` power state** is defined and documented but never computed (`:675, 692, 698-701`).
- **Wasted request.** A `trigger-status` GET is fired before each run and its result discarded (`:395-396`).
- **UpdatesPanel:**
  - The apply bug is Top #2.
  - Checkboxes are 16 px (`:587-602`). Make the whole row the label.
  - The Updates confirm is blue even though applying restarts containers.
  - There is no per-row "Update" button.
- **ClaudeTerminalViewer:**
  - `scrollIntoView` every 5 s (`:54-58`) pulls you away from the scrollback you're reading.
  - `animate-spin` is a spinner, which DESIGN bans.
  - A 401 and a network error both show as "not capturable".

### Gaming (`GamingPage`)
- **ToastBanner calls `setTimeout` during render** (`:118`). Each re-render queues another timer, so an old timer can dismiss a newer toast. Move it into `useEffect`.
- **Grid overflows on phones.** `minmax(300px,1fr)` (`:624, 634`) overflows 320–360 px phones. Use `minmax(min(300px,100%),1fr)`.
- **Missing data looks like "S1 offline"** (Top #4).
- **Tap targets.** `:148` (40 px), `:259` (36 px), and `:294-295` (a 22×22 refresh icon with a spinner).
- **Colour and text size.** PAL uses an orange wash with `--v4-amber` (blue) text (`:387`). Text at `:420` is 8 px.
- **Missing actions.** There is no Sleep or Shutdown for S1 when it's online, and no VS or PAL logs. "No game servers reported" (`:628`) has no follow-up action.

### Printer (`PrinterPage`)
- **Light borders.** `text-white` and `focus:border-[var(--v4-signal)]` (near-white) on the search field (`:181, 187`).
- **Hardcoded colours** `#ccc`, `#888` and `bg-[#1a1414]` (`:149, 222, 231, 286`).
- **Weight colours never apply** (Top #10).
- **Header overflows at 375 px** (`:167-193`, fixed `w-48`). Use `flex-wrap` and `w-full sm:w-48`.
- **Status mapping.**
  - FAILED and PAUSE show green (`:101`).
  - The progress line can show `undefined%` (`:131-132`).
  - The modal and the list disagree about "empty" (`:216` vs `:298`).
- **Errors look like empty search results.** A failed fetch, an empty inventory and a search with no match all show "No spools found matching your search" (`:30-33, 204-207`).
- **Admin gap.** `POST /api/filament/:id/update` exists on the server (`server/server.js:1650`) but there's no Edit weight or Mark empty/restocked button.
- **Accessibility.** The sort button is about 28 px with only a `title`, and its A–Z icon misdescribes what is actually a weight sort. Swatch buttons are 16 px.

### Tools (`ToolsPage`)
- **Banned light borders.** `border-white/5` and `border-white/10` (dashed) at `:99, 117, 154, 179`, plus `hover:border-[var(--v4-signal)]`. Use `--v4-hairline` and a focus `ring` in the accent colour.
- **Hover turns the primary button near-white** (`:107`, `hover:bg-[var(--v4-signal)]`). Use `hover:brightness-110`.
- **Errors use `alert()`** (`:41`). Show an inline Fault message instead, as the ASR panel does.
- **Upload isn't keyboard-reachable.** The file input is `display:none` (`:149-154`). Use `sr-only` with `focus-within` on the label.
- **The textarea has no label** (`:98`).
- **The page looks unfinished next to Home.** It has no PanelTitle, no PageTitle and no tokenized text colours.

### Jobs (`JobsPage`)
- **No error handling.** No `catch` and no `res.ok` check (`:60-71`), so failures read "No jobs in this view".
- **Score badge contrast.** The badge is white on 0.85-alpha green or amber, about 2.4:1 (`:29-37`).
- **Accessibility.** The clickable info area is a `<div>` (`:179-182`). The external-link icon has no `aria-label` (`:206-213`). Applied/undo are 10 px text in an 18 px target (`:215-231`).
- **Inconsistent title.** It uses its own `text-[1rem]` title instead of `PageTitle` (`:100-105`).
- **Every filter change** refetches 300 rows with a full skeleton flash.

### Jarvis (`JarvisPage`)
- **Recording breaks on the iPhone.** `MediaRecorder(…, {mimeType:'audio/webm'})` throws on iOS Safari (`:41`), and the error then shows as "Microphone access denied" (`:52-54`). Choose a supported type with `MediaRecorder.isTypeSupported` (`audio/mp4` on iOS).
- **"JARVIS ONLINE" is hardcoded** (`:102-103`).
- **"Clear memory" is a destructive action** behind a 13 px icon with no confirm and no `aria-label` (`:105-112`).
- **Mic button** has no `aria-label` or `aria-pressed` (`:152`), and the replay icon is 11 px. The conversation needs `aria-live="polite"`.
- **Cleanup gaps.** Object URLs are never revoked, `audio.play()` has no `.catch` (`:85, 88`), and the mic stream isn't stopped on unmount.
- **Off-palette colours** `#fff` and `rgba(239,68,68)` (`:124, 162-167`).

### Kiosk (`KioskPage`)
- **It uses its own palette.**
  - The background is `#080810` and the accent is teal `#14b8a6`, with Tailwind greens.
  - Cards have 1 px status-coloured borders plus `0 4px 24px` coloured glows (`:63, 98-106, 157, 526-542, 572`).
  - `--k-dim` text is about 2:1 contrast.
  - Map it onto the `--v4-*` tokens and the `.v4-stripe-*` classes, and remove the glows.
- **False HEALTHY and endless "Loading…"** (Top #4 and #5).
- **Grid doesn't adapt.** The fixed `repeat(4,1fr)` (`:639`) gives about 180 px cards on an 800 px portrait tablet. Use `auto-fill, minmax(280px,1fr)`.
- **Issues banner** uses `overflowX:auto` (`:615`), and a wall display can't be scrolled. Use `flex-wrap`.
- **`shown` is computed but `machines` is rendered** (`:141, 149`).

### Login (`LoginPage`)
- **Inputs are 14 px** (`:94, 127`), so iOS zooms on focus. Use 16 px on mobile.
- **The button is 40 px tall** (`:158`).
- **The redirect-from location is ignored** (`:30`).
- **No `aria-invalid` or `aria-describedby`** links the error to the inputs.
- **Focus ring is done in JS** (`:102-107`). Use `focus-visible:` classes.

### Shared modals
- **`DetailModal`**
  - `onClose` fires 2–3 times per close (`:36, 61-62, 97`).
  - There is no `Dialog.Description`, so Radix logs a warning.
  - It uses `vh` (`:130`, `v4.css:194/216`). Use `dvh` for iOS.
- **`AutomationJobDetailModal:27`** returns `null` as soon as the job clears, which skips the close animation. It also shows "running" in Degraded amber, and has no "Run now" or "View full log".
- **`HostDetailModal:77-79`** pushes to the GPU trace during render, so it records once per render (and twice under StrictMode). The IP table (`:13-28`) is hardcoded with duplicate case variants. There are no host actions (WoL, reboot).
- **`AlertBell:31`** uses `FAULT_RE=/fail|error|down/`, which paints recovery messages ("…back up after down") red. Badge text is 9 px, and the count caps at "99" instead of "99+".
- **`ContainerLogTail`**
  - `:107` double-fetches on refresh.
  - `:75` uses `scrollIntoView`, which moves the sheet or page.
  - `:120` uses a spinner.

### Dead and duplicated code
- **Unused v4 components** (nothing imports them from `V4Router`): `AutomationDigest.tsx`, `HomeSummaryWidgets.tsx`, `HostTile.tsx`, `LoadChartsPanel.tsx`, `TorrentsPanel.tsx`.
- **`QuickLinks.tsx:3`** uses `import * as LucideIcons`, which defeats tree-shaking and is the likely main cause of the 644 kB `v4` chunk. Use an explicit icon map.
- **Dead legacy code under `src/`:**
  - `src/Pages/Lab/**` (14 files).
  - `components/ServerCards`, `ServiceGraph`, `ServiceModal`, `SystemMonitor`, `ImportExportModal`, `PasswordChangeModal`, `BaseModal`.
  - `services/serviceService.ts`, `types/service.ts`.
  - The `ui/` files `badge`, `button`, `table`, `tabs`, `tooltip`, `card`, `skeleton`.
- **Legacy routes still live:**
  - `/login` (a duplicate of `v4/pages/LoginPage`, and legacy `ProtectedRoute` sends users there).
  - `/birthday`, `/chaos`, `/home`, `/alerts`.
  - `LegacyShell`, which still has a light-theme toggle.
  - Redirect `/login` to `/v4/login`, then port or redirect the rest.
- **Duplicated helpers:**
  - `cn()` in both `src/v4/lib/utils.ts` and `src/lib/utils.ts`.
  - `fmtBytes`/`relativeTime` reimplemented 5 times (JobsPage:39, AlertHistoryModal:26, LiveDownloadsPanel:61, KioskPage:69, AlertCenter:65).
  - `jobStatusLevel` twice.
  - 3 separate ToastBanner/ConfirmModal implementations, although `sonner` is already a dependency.

### Build / lint / typecheck results
| Step | Result |
|---|---|
| `npm ci` | **Fails.** `package-lock.json` is in `.gitignore`, so a clean checkout can't run `npm ci`. The `Dockerfile:13` `RUN npm ci` only works if a lockfile happens to exist on the build host. Commit the lockfile. |
| `npm install && npm run build` (tsc + vite) | **Passes.** One warning: `dist/assets/v4-*.js` is **644 kB** (170 kB gzip), over the 600 kB limit. Lazy-load pages with `React.lazy` in `V4Router` and fix the QuickLinks import. |
| `tsc` without local deps (global TS 6.0.2) | Fails with `TS5101: 'baseUrl' is deprecated` (`tsconfig.json:18`). This breaks once TS is bumped. Remove `baseUrl` (use `paths` only) or add `"ignoreDeprecations": "6.0"`. |
| `eslint` | **No ESLint config exists** in the repo, even though eslint, `@typescript-eslint` and `react-hooks` are in devDependencies, so there is no lint step. An ad-hoc run with only the react-hooks rules found 2 warnings (`ControlsPage.tsx:467` unstable `serverStatusMap` dep; `GamingPage.tsx:185` missing `load` dep). It also found 4 errors from disable comments that name the unloaded `@typescript-eslint/no-explicit-any` rule (`MediaPage.tsx:1488-1495`). |

---

## 4. Quick wins (each under 15 minutes)

1. Add a global focus ring in `v4.css`: `.v4-root :focus-visible { outline:2px solid var(--v4-amber); outline-offset:2px }`.
2. Add a `prefers-reduced-motion` block to `v4.css` that turns off animations and transitions.
3. Add `aria-label={tab.label}` and `aria-current` to the rail and bottom-nav links in `AppShell.tsx:124, 283`. Add `aria-expanded` to More.
4. Remove the inline `gap: 0` at `AppShell.tsx:137` so xl rail labels get their 10 px gap.
5. Add Jarvis to `TABS` (`AppShell.tsx:20-29`).
6. Fix the duplicate torrent rows by dropping `qbitQueued` (`LiveDownloadsPanel.tsx:224-227`).
7. Make Home panels scroll: add `overflow-y:auto` to `.v5-col .v5-panel` in `v4.css:431-436`. That's a stopgap until the header/body split from Top #1.
8. Change `ServicesPage.tsx:753` to `?all=1` so stopped containers appear and can be Started.
9. In `UpdatesPanel.tsx`, delete line 274 and fix the `jobDone` null check at 288.
10. Use `useCallback` for the Controls toast `onDismiss` (`ControlsPage.tsx:504`).
11. Wrap the failover activate/deactivate calls in `try/finally` (`ControlsPage.tsx:426-452`).
12. Gate the AlertHistoryModal effect on `!failed` (`:141-145`) to stop the retry loop.
13. Change Kiosk's fallback status from `'healthy'` to `'unknown'` (`KioskPage.tsx:518`).
14. Use the `useState(() => loadFromCache())` lazy initializer (`useLabStream.ts:108`) and `useMemo` the context value (`useSnapshot.tsx:165`).
15. Fix `Primitives.tsx` so it destructures `style` before spreading props.
16. Replace the `border-white/*` and `focus:border-[var(--v4-signal)]` borders in ToolsPage and PrinterPage with `--v4-hairline` plus a focus ring.
17. Replace the `#a78bfa` purple in MediaPage with `var(--v4-readout)`.
18. Change the GamingPage grid to `minmax(min(300px,100%),1fr)` (`:624, 634`).
19. Remove the dead CSS (`v4.css:145-153` and `233-293`) and delete the 5 unused v4 components.
20. Stop ignoring `package-lock.json` and commit it. Add a minimal `.eslintrc.cjs` with `react-hooks/recommended` and `@typescript-eslint/recommended`.
21. Add a `screens` override in `tailwind.config.js` (`lg:1280, xl:1440`) so Tailwind and v5 CSS agree on breakpoints. Re-check the pages that use `lg:` after the change.
22. Choose a supported `MediaRecorder` mimeType in Jarvis (`JarvisPage.tsx:41`) so recording works on the iPhone.
