// Media proxy routes — Sonarr / Radarr queues + stats, Bazarr wanted, upcoming
// calendar, Tautulli Plex sessions. Extracted from server.js (Phase 3 route split).
import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../auth.js';

const router = express.Router();

const SONARR_URL = process.env.SONARR_URL || 'http://192.168.50.13:8989';
const SONARR_KEY = process.env.SONARR_KEY;  // required — set in server/.env
const RADARR_URL = process.env.RADARR_URL || 'http://192.168.50.13:7878';
const RADARR_KEY = process.env.RADARR_KEY;  // required — set in server/.env
const BAZARR_URL = process.env.BAZARR_URL || 'http://192.168.50.13:6767';
const BAZARR_KEY = process.env.BAZARR_KEY;  // required — set in server/.env

// Tautulli — Plex session monitor. Key must be set in server/.env as TAUTULLI_API_KEY.
// URL defaults to CT100 (same host as the dashboard container on the docker network).
const TAUTULLI_URL = process.env.TAUTULLI_URL || 'http://192.168.50.13:8181';
const TAUTULLI_KEY = process.env.TAUTULLI_API_KEY; // undefined when not configured

// ── Tautulli simple cache — avoids hammering the API on every client render ──
let _tautulliCache = null;   // { sessions, recentlyAdded, fetchedAt }
const TAUTULLI_TTL_MS = 15_000; // 15 s

async function tautulliCmd(cmd, extra = '') {
  if (!TAUTULLI_KEY) throw new Error('TAUTULLI_API_KEY not configured');
  const url = `${TAUTULLI_URL}/api/v2?apikey=${TAUTULLI_KEY}&cmd=${cmd}${extra}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Tautulli ${cmd} HTTP ${r.status}`);
  const json = await r.json();
  if (json?.response?.result !== 'success') throw new Error(`Tautulli error: ${json?.response?.message}`);
  return json.response.data;
}

async function arrFetch(baseUrl, apiKey, path) {
  const r = await fetch(`${baseUrl}/api/v3${path}`, { headers: { 'X-Api-Key': apiKey } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

router.get('/api/media/queue', authMiddleware, async (req, res) => {
  try {
    const [sq, rq] = await Promise.allSettled([
      arrFetch(SONARR_URL, SONARR_KEY, '/queue?pageSize=50&includeUnknownSeriesItems=false&includeSeries=true&includeEpisode=true'),
      arrFetch(RADARR_URL, RADARR_KEY, '/queue?pageSize=50&includeUnknownMovieItems=false&includeMovie=true'),
    ]);
    res.json({
      sonarr: sq.status === 'fulfilled' ? sq.value.records || [] : [],
      radarr: rq.status === 'fulfilled' ? rq.value.records || [] : [],
    });
  } catch (e) { res.status(503).json({ error: 'Media services unavailable' }); }
});

router.get('/api/media/stats', authMiddleware, async (req, res) => {
  try {
    const [ss, rs, sq, rq] = await Promise.allSettled([
      arrFetch(SONARR_URL, SONARR_KEY, '/wanted/missing?pageSize=1'),
      arrFetch(RADARR_URL, RADARR_KEY, '/wanted/missing?pageSize=1'),
      arrFetch(SONARR_URL, SONARR_KEY, '/queue?pageSize=1'),
      arrFetch(RADARR_URL, RADARR_KEY, '/queue?pageSize=1'),
    ]);
    res.json({
      sonarr: { missing: ss.status === 'fulfilled' ? ss.value.totalRecords || 0 : null, queued: sq.status === 'fulfilled' ? sq.value.totalRecords || 0 : null },
      radarr: { missing: rs.status === 'fulfilled' ? rs.value.totalRecords || 0 : null, queued: rq.status === 'fulfilled' ? rq.value.totalRecords || 0 : null },
    });
  } catch (e) { res.status(503).json({ error: 'Media services unavailable' }); }
});

router.get('/api/bazarr/wanted', authMiddleware, async (req, res) => {
  try {
    const r = await fetch(`${BAZARR_URL}/api/episodes/wanted?start=0&length=5`, {
      headers: { 'X-API-KEY': BAZARR_KEY },
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const data = await r.json();
    // Also fetch totals for history count
    const h = await fetch(`${BAZARR_URL}/api/episodes/history?start=0&length=1`, {
      headers: { 'X-API-KEY': BAZARR_KEY },
    });
    const hist = h.ok ? await h.json() : {};
    res.json({
      wanted: data.total || 0,
      recent: (data.data || []).slice(0, 5).map(e => ({
        series: e.seriesTitle,
        episode: e.episode_number,
      })),
      downloaded: hist.total || 0,
    });
  } catch (e) { res.status(503).json({ error: 'Bazarr unavailable' }); }
});

router.get('/api/media/upcoming', optionalAuthMiddleware, async (req, res) => {
  try {
    const today = new Date();
    const end = new Date(today); end.setDate(today.getDate() + 45);
    const startStr = today.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const [cal, movies] = await Promise.allSettled([
      arrFetch(SONARR_URL, SONARR_KEY, `/calendar?start=${startStr}&end=${endStr}&includeSeries=true`),
      arrFetch(RADARR_URL, RADARR_KEY, '/movie?monitored=true'),
    ]);
    const episodes = (cal.status === 'fulfilled' && Array.isArray(cal.value) ? cal.value : []).map(ep => ({
      type: 'episode',
      id: ep.id,
      title: ep.series?.title || 'Unknown',
      episode: `S${String(ep.seasonNumber).padStart(2,'0')}E${String(ep.episodeNumber).padStart(2,'0')}`,
      episodeTitle: ep.title || '',
      airDate: ep.airDateUtc || ep.airDate || '',
      hasFile: ep.hasFile || false,
      network: ep.series?.network || '',
    }));
    const upcomingMovies = (movies.status === 'fulfilled' && Array.isArray(movies.value) ? movies.value : [])
      .filter(m => {
        const release = m.digitalRelease || m.physicalRelease || m.inCinemas;
        if (!release) return false;
        const d = new Date(release);
        return d >= today && d <= end;
      })
      .map(m => ({
        type: 'movie',
        id: m.id,
        title: m.title,
        year: m.year,
        digitalRelease: m.digitalRelease || null,
        physicalRelease: m.physicalRelease || null,
        inCinemas: m.inCinemas || null,
        studio: m.studio || '',
      }));
    res.json({ episodes, movies: upcomingMovies });
  } catch (e) { res.status(503).json({ error: 'Media services unavailable' }); }
});

// ── GET /api/media/plex-sessions ─────────────────────────────────────────────
// Returns current Plex streams via Tautulli get_activity + recently added items.
// Cached for 15 s to keep API calls low. Returns { unavailable: true } when the
// TAUTULLI_API_KEY env var is absent — page renders a quiet unconfigured state.
router.get('/api/media/plex-sessions', authMiddleware, async (req, res) => {
  // Fast unavailable path — no key set
  if (!TAUTULLI_KEY) {
    return res.json({ unavailable: true, reason: 'TAUTULLI_API_KEY not configured' });
  }

  // Serve cached result if still fresh
  const now = Date.now();
  if (_tautulliCache && now - _tautulliCache.fetchedAt < TAUTULLI_TTL_MS) {
    return res.json(_tautulliCache);
  }

  try {
    const [activityData, recentData] = await Promise.allSettled([
      tautulliCmd('get_activity'),
      tautulliCmd('get_recently_added', '&count=10'),
    ]);

    // ── Map activity sessions ────────────────────────────────────────────────
    const rawSessions = activityData.status === 'fulfilled'
      ? (activityData.value?.sessions ?? [])
      : [];

    const sessions = rawSessions.map(s => ({
      session_key:        s.session_key ?? s.sessionKey ?? String(Math.random()),
      user:               s.friendly_name || s.username || 'Unknown',
      full_title:         s.full_title || [s.grandparent_title, s.parent_title, s.title].filter(Boolean).join(' — '),
      media_type:         s.media_type || 'unknown',
      state:              s.state || 'unknown',         // playing | paused | buffering
      progress_percent:   Number(s.progress_percent) || 0,
      transcode_decision: s.transcode_decision || 'direct play', // direct play | copy | transcode
      player:             s.player || s.device || '—',
      quality_profile:    s.quality_profile || null,
      bandwidth:          s.bandwidth ? Number(s.bandwidth) : null, // kbps
      stream_video_codec: s.stream_video_codec || s.video_codec || null,
      duration_ms:        s.duration ? Number(s.duration) * 1000 : null,
      view_offset_ms:     s.view_offset ? Number(s.view_offset) * 1000 : null,
    }));

    // ── Map recently added ────────────────────────────────────────────────────
    const rawRecent = recentData.status === 'fulfilled'
      ? (recentData.value?.recently_added ?? [])
      : [];

    const recentlyAdded = rawRecent.map(r => ({
      rating_key:   String(r.rating_key || ''),
      title:        r.title || '—',
      full_title:   r.full_title || [r.grandparent_title, r.parent_title, r.title].filter(Boolean).join(' — '),
      media_type:   r.media_type || 'unknown',
      thumb:        null, // thumbnails require token — omit for simplicity
      added_at:     r.added_at ? Number(r.added_at) : null, // unix timestamp
      year:         r.year || null,
      // For episodes: grandparent = series, parent = season
      grandparent_title: r.grandparent_title || null,
      parent_title:      r.parent_title || null,
    }));

    const result = {
      sessions,
      recentlyAdded,
      streamCount: sessions.length,
      fetchedAt: now,
    };
    _tautulliCache = result;
    return res.json(result);
  } catch (err) {
    // Tautulli unreachable / error — return degraded response so page can show it
    console.error('[tautulli]', err.message);
    return res.status(503).json({
      unavailable: true,
      reason: err.message || 'Tautulli unreachable',
    });
  }
});

export default router;
