// Auth routes — login, register (disabled), me, change-password.
// Extracted from server.js (Phase 3 route split). Behaviour byte-identical:
// same paths, methods, middleware, and response shapes.
import express from 'express';
import db from '../database.js';
import {
  generateToken,
  authMiddleware,
  hashPassword,
  comparePassword,
  getUserByEmail,
  getUserById,
} from '../auth.js';

const router = express.Router();

// Simple in-memory login rate limiter: max 10 attempts per IP per 15 minutes
const loginAttempts = new Map();
const loginRateLimit = (req, res, next) => {
  const ip = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const max = 10;
  const entry = loginAttempts.get(ip) || { count: 0, reset: now + window };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window; }
  entry.count++;
  loginAttempts.set(ip, entry);
  if (entry.count > max) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  next();
};

router.post('/api/auth/register', (req, res) => {
  res.status(403).json({ error: 'Registration is disabled' });
});

router.post('/api/auth/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.email);
    const userInfo = { id: user.id, email: user.email, displayName: user.display_name };

    res.json({ user: userInfo, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

router.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = getUserByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await comparePassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?');
    stmt.run(newPasswordHash, Date.now(), user.id);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
});

export default router;
