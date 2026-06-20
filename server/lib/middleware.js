// Shared custom middleware used across route modules and the SSE layer.
// Extracted from server.js (Phase 3 route split); behaviour byte-identical.
import { authMiddleware, verifyToken } from '../auth.js';

// LAN bypass middleware: uses socket remoteAddress (not spoofable via XFF).
// NOTE: do NOT trust 172.* — public traffic arrives via the nginx container's
// docker IP (172.x), which made every lanOrAuth endpoint publicly readable.
// True LAN clients hit :3001 directly and keep the bypass; everything routed
// through the proxy (including dash.jojeco.ca) must present a JWT.
export const lanOrAuth = (req, res, next) => {
  const ip = (req.socket?.remoteAddress || req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
  if (
    ip.startsWith('192.168.50.') ||
    ip === '::1' ||
    ip === '127.0.0.1'
  ) return next();
  return authMiddleware(req, res, next);
};

// SSE-specific auth: accepts Bearer header OR ?token= query param (EventSource
// can't set custom headers, so the frontend appends the JWT as a URL param).
export const sseAuthMiddleware = (req, res, next) => {
  // Try Authorization header first (curl / fetch clients)
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const decoded = verifyToken(header.substring(7));
    if (decoded) { req.user = decoded; return next(); }
  }
  // Fall back to ?token= query param (EventSource clients)
  const qtoken = req.query.token;
  if (qtoken) {
    const decoded = verifyToken(String(qtoken));
    if (decoded) { req.user = decoded; return next(); }
  }
  return res.status(401).json({ error: 'No token provided' });
};
