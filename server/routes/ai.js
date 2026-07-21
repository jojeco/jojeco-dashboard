// AI chat proxy — streams a chat completion from the LiteLLM gateway back to the
// browser as Server-Sent Events. Extracted from server.js (Phase 4 route split);
// handler body byte-identical.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const LITELLM_URL = 'http://192.168.50.13:4000/v1/chat/completions';
const LITELLM_KEY = process.env.LITELLM_KEY;  // required — set in server/.env

router.post('/api/ai/chat', authMiddleware, async (req, res) => {
  const { model = 'local-smart', messages, max_tokens = 2000, temperature = 0.7 } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const upstream = await fetch(LITELLM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_KEY}`,
      },
      body: JSON.stringify({ model, messages, stream: true, max_tokens, temperature }),
      signal: AbortSignal.timeout(180000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.write(`data: {"error":"LiteLLM ${upstream.status}: ${errText.slice(0,200)}"}\n\n`);
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    res.write(`data: {"error":"${String(err.message).replace(/"/g, "'")}"}\n\n`);
    res.end();
  }
});

export default router;
