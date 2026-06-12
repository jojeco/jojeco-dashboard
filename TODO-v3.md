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
| Lab | LabPage.tsx (999 lines) | Most visible — split into sub-components |
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

- [ ] `/api/snapshot` endpoint on API — single aggregated payload to replace 21 pollers
- [ ] `useSnapshot` hook — replaces per-page setInterval pollers
- [ ] Decompose LabPage.tsx into sub-components (it's 999 lines)
- [ ] Remove `/ai` orphan route (Odysseus replaced LibreChat)
- [ ] Feature-parity checklist per page before marking done

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
