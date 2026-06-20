// Media proxy routes — Sonarr / Radarr queues + stats, Bazarr wanted, upcoming
// calendar. Extracted from server.js (Phase 3 route split); byte-identical.
import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../auth.js';

const router = express.Router();

const SONARR_URL = process.env.SONARR_URL || 'http://192.168.50.13:8989';
const SONARR_KEY = process.env.SONARR_KEY || 'REDACTED';
const RADARR_URL = process.env.RADARR_URL || 'http://192.168.50.13:7878';
const RADARR_KEY = process.env.RADARR_KEY || 'REDACTED';
const BAZARR_URL = process.env.BAZARR_URL || 'http://192.168.50.13:6767';
const BAZARR_KEY = process.env.BAZARR_KEY || 'REDACTED';

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

export default router;
