/**
 * v4 Home — the money screen, now a customizable widget board.
 *
 * The Home layout is a drag/resize/reorder grid (react-grid-layout) the owner
 * arranges to taste. Default (VIEW) mode reads like a clean dashboard; "Edit
 * Layout" unlocks drag + resize handles and an "+ Add widget" picker sourced
 * from a widget registry (lib/homeWidgets). Layout + active widgets persist to
 * localStorage (`v4:homeLayout`). See HomeGrid + lib/homeWidgets for the system.
 *
 * Widgets wrap the EXISTING Home panels (AlertStrip, HostTileDPanel, Service
 * Health, Storage, Automation, Load charts, Downloads, Gaming) plus compact
 * summary cards addable from other tabs (Media, Service Matrix, Game Servers).
 *
 * Data: every widget reads the shared SSE snapshot — no fabricated values.
 */
import HomeGrid from '../components/HomeGrid';

export default function HomePage() {
  return <HomeGrid />;
}
