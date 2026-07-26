import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

function chunkText(text, maxLen = 600) {
    const chunks = [];
    let currentChunk = '';
    
    // Split by punctuation first, keeping the punctuation
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxLen && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += sentence;
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

function concatenateWavBuffers(buffers) {
    if (buffers.length === 0) return Buffer.alloc(0);
    if (buffers.length === 1) return buffers[0];
    
    // Standard WAV header is 44 bytes.
    // Ensure all buffers are valid WAVs with at least 44 bytes.
    const validBuffers = buffers.filter(b => b.length >= 44);
    if (validBuffers.length === 0) return Buffer.alloc(0);
    
    const header = Buffer.from(validBuffers[0].slice(0, 44));
    
    let totalDataLen = 0;
    const dataChunks = [];
    
    for (const buf of validBuffers) {
        const data = buf.slice(44);
        totalDataLen += data.length;
        dataChunks.push(data);
    }
    
    // Update data length in header (bytes 40-43, little endian)
    header.writeUInt32LE(totalDataLen, 40);
    
    // Update file length in header (bytes 4-7, little endian = total length - 8)
    header.writeUInt32LE(totalDataLen + 36, 4);
    
    return Buffer.concat([header, ...dataChunks]);
}

router.post('/api/tools/tts', authMiddleware, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Missing text' });
        }
        
        const chunks = chunkText(text);
        const buffers = [];
        
        for (const chunk of chunks) {
            const url = `http://192.168.50.12:8400/tts?text=${encodeURIComponent(chunk)}`;
            const response = await fetch(url, { method: 'POST' });
            if (!response.ok) {
                throw new Error(`Piper TTS returned ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            buffers.push(Buffer.from(arrayBuffer));
        }
        
        const finalBuffer = concatenateWavBuffers(buffers);
        
        res.set('Content-Type', 'audio/wav');
        res.send(finalBuffer);
        
    } catch (error) {
        console.error('TTS error:', error);
        res.status(500).json({ error: 'Failed to generate audio' });
    }
});

// Use memory storage for the uploaded file so we can forward it directly
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

router.post('/api/tools/transcribe', authMiddleware, upload.single('audio_file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Missing audio file' });
        }
        
        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        formData.append('audio_file', blob, req.file.originalname);

        const url = 'http://192.168.50.12:9000/asr?output=txt';
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`ASR returned ${response.status}`);
        }

        const transcript = await response.text();
        res.json({ text: transcript });
        
    } catch (error) {
        console.error('ASR error:', error);
        res.status(500).json({ error: 'Failed to transcribe audio' });
    }
});

export default router;
