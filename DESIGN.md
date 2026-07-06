# Design System: JojeCo Ops — Lab Control Room (redesign-v4)

Single source of truth for the ground-up dash.jojeco.ca redesign. Every screen —
whether generated in Google Stitch, drafted by an agent, or hand-built — conforms
to this document. Stack: React + TS + Tailwind + Radix primitives + recharts.

## 1. Visual Theme & Atmosphere
A dark, cockpit-dense control room: the calm confidence of a broadcast master
console, not a gamer RGB rig. Information density is high (density 8/10) but
disciplined — hierarchy comes from surface contrast, weight, and monospace
alignment, never from clutter. Layouts are offset-asymmetric (variance 5/10):
primary telemetry claims the leading column, secondary systems stack in a
narrower rail. Motion is restrained-fluid (4/10): data breathes, chrome holds
still. Mobile is the first-class citizen — the owner runs this lab from an
iPhone; desktop (≥1280px) expands into the full command-center grid.

## 2. Color Palette & Roles
- **Void** (#0B0B0D) — app canvas. Never pure black.
- **Console Surface** (#141418) — primary tile/panel fill. Separation from Void
  comes from THIS contrast step, not from border lines.
- **Raised Console** (#1C1C22) — hover states, active tiles, sticky headers.
- **Recessed Well** (#0E0E11) — log tails, code, chart plot areas (inset feel).
- **Primary Signal** (#E6E6EA) — headings, key figures.
- **Muted Readout** (#9A9AA3) — labels, metadata, secondary text.
- **Dimmed Trace** (#5C5C66) — timestamps, disabled, tertiary.
- **Amber Command** (#D99A3D) — THE single interactive accent: primary buttons,
  active nav, focus rings, selected states. Desaturated amber — instrument
  panel, not warning tape.
- Status semantics (functional, not decorative — used ONLY to convey real state):
  - **Nominal** (#3FA97C) — service up / job OK
  - **Degraded** (#C9973F) — warning / stale / partial
  - **Fault** (#C25049) — down / failed (pair with a text label, never color alone)
  - **Standby** (#5C5C66) — disabled / vestigial / unknown

**Border rule (owner's law):** light borders on dark are BANNED. Structure is
expressed by surface-contrast steps, 2px status edge-stripes (inset, left side),
and negative space. Where a hairline is unavoidable (table rows in dense lists)
use `rgba(255,255,255,0.06)` maximum — felt, not seen.

## 3. Typography Rules
- **Display / headings:** Geist — track-tight (-0.02em), weight-driven hierarchy
  (600/500), controlled sizes: page title 1.25rem, panel title 0.875rem
  uppercase +0.06em tracking in Muted Readout.
- **Body / labels:** Geist — 0.875rem base on mobile, 65ch max for prose.
- **Data / numbers / logs / timestamps:** Geist Mono — MANDATORY for every
  numeric readout, table figure, log line, IP, port, duration. Tabular-nums.
- **Banned:** Inter, all serifs, system-ui fallback as the primary face.

## 4. Component Stylings
- **Status tile:** Console Surface, 0.75rem radius, 2px left edge-stripe in
  status color, name in body face, readout (latency/uptime) in mono. Tap target
  ≥44px. Press: scale(0.98) spring. Down state: Fault stripe + "DOWN" mono
  label — never a red fill wash.
- **Panels/cards:** used only when grouping serves hierarchy; radius 1rem,
  shadow `0 1px 0 rgba(0,0,0,0.4)` (tinted to Void, near-invisible). Inside
  dense panels, rows separate with the hairline rule, not boxes-in-boxes.
- **Buttons:** primary = Amber Command fill, Void text, tactile -1px translate
  on active. Secondary = Raised Console fill. Destructive actions (restart,
  stop, delete) = ghost with Fault text + REQUIRED confirm step naming the
  target ("Restart nextcloud?"). No outer glows.
- **Charts (recharts):** plot on Recessed Well; single-hue traces (Amber
  Command for the focal series, Muted Readout for context series); mono axis
  ticks; no gradient fills brighter than 12% opacity; tooltips = Raised Console.
- **Log tail / terminal widgets:** Recessed Well, Geist Mono 0.75rem, newest
  line slides in via opacity+transform. Max-height with internal scroll.
- **Inputs:** label above (Muted Readout, 0.75rem), field on Raised Console,
  Amber focus ring, error text below in Fault. No floating labels.
- **Loading:** skeletal shimmer matching final layout dimensions. No spinners.
- **Empty states:** composed one-liner + the action that populates it
  ("No jobs have run yet — trigger one from Controls"). Never bare "No data".

## 5. Layout Principles
- **Mobile (<768px):** strict single column, panel order = alerts → hosts →
  services → automation → controls. No horizontal scroll ever.
- **Desktop (≥1280px):** command-center grid — 8/4 asymmetric split: telemetry
  and charts lead (8), rail (4) stacks alerts, automation, quick controls.
  Max-width 1600px centered. CSS Grid, no flexbox width math.
- Full-height uses `min-h-[100dvh]`, never `h-screen`.
- The "3 equal cards" row is banned; host groups render as asymmetric
  auto-fill tile grids (minmax(140px, 1fr)).
- Navigation: bottom tab bar on mobile (thumb reach), left rail on desktop.

## 6. Motion & Interaction
- Springs only (stiffness 100, damping 20); no linear easing anywhere.
- Live elements carry a perpetual micro-pulse: the SSE "live" dot breathes
  (opacity 0.5→1, 2s), fresh data rows settle with a 150ms transform ease-out.
  Static chrome NEVER animates.
- Lists mount with 30ms stagger cascade, capped at 10 items.
- transform/opacity only. No width/height/top/left animation.

## 7. Anti-Patterns (Banned)
- Light borders on dark surfaces (owner's law — surface contrast instead)
- Emojis in UI chrome (lucide icons only, 16/20px, Muted Readout tint)
- Inter; any serif; pure #000000; neon or purple glows; gradient text
- Fabricated data of any kind — every figure on this dashboard is live lab
  telemetry; if a value is unavailable render "—" in Dimmed Trace, never a
  made-up number
- 3-column equal card rows; centered hero layouts; decorative stock imagery
- Color-only status (always pair stripe/dot with text for the down state)
- "Elevate/Seamless/Unleash" copy; UI text is terse and operational
  ("Restart", "Last run 04:00 · OK", "3 of 22 down")
- Circular spinners; toast spam (one toast per action outcome, sonner)
