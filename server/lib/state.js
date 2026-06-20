// Shared application state — the mutable caches and cross-module job trackers
// that route modules, the SSE/snapshot layer, and the background poller loops
// all reference. Extracted from server.js (Phase 3 route split) so that splitting
// the monolith into route modules does NOT fork these into separate copies:
// every importer gets the SAME object instances.
//
// IMPORTANT: only mutate the *contents* of these objects/maps — never reassign
// the bindings (that would break the shared reference). For the few values that
// were `let`-reassigned in the monolith (updateCache, printerCache), we expose
// them as single-key holder objects so the reference stays stable.

// ── Snapshot / SSE shared cache ──────────────────────────────────────────────
// `${section}:${auth|guest}` → { at, data }. Shared by /api/snapshot and the
// SSE push loop so both serve the same cached lab data.
export const snapshotCache = new Map();

// ── Service health poller cache ──────────────────────────────────────────────
// serviceId → { serviceId, name, status, statusCode, responseTime, error, checkedAt }
// Written by runServiceHealthPoller(), read by GET /api/health/services.
export const serviceHealthCache = new Map();

// ── On-demand server-side health cache (GET /api/services/health) ─────────────
// serviceId → { status, responseTime, checkedAt }
export const serverHealthCache = new Map();

// ── Background health monitor hysteresis state ───────────────────────────────
// id → { fails, alerted }
export const serviceState = {};

// ── Trigger job tracker (controls + updates share these) ─────────────────────
// action/jobId → { status, startedAt, finishedAt, output, error }
export const triggerJobs = {};
// action → child process handle (so a running job can be aborted)
export const triggerProcesses = {};

// ── Update checker cache ─────────────────────────────────────────────────────
// Holder object so the reference stays stable across modules; mutate .value.
export const updateCacheRef = { value: { checked: null, results: [] } };

// ── P1S printer poller cache ─────────────────────────────────────────────────
// Holder object — the poller replaces .value with each fresh poll result.
export const printerCacheRef = { value: { online: false, lastFetch: 0 } };
