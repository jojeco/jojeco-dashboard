import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const JWT_SECRET = 'your-secret-key-change-in-production';
const token = jwt.sign({ userId: 'test', email: 'test@test.com' }, JWT_SECRET, { expiresIn: '7d' });

async function test() {
  console.log('Testing TTS...');
  try {
    const ttsRes = await fetch('http://localhost:3001/api/tools/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ text: 'Hello! I am Piper, your virtual assistant.' })
    });
    console.log('TTS Status:', ttsRes.status);
    
    if (ttsRes.ok) {
        const audioBuffer = await ttsRes.buffer();
        console.log('TTS output size:', audioBuffer.length);
        fs.writeFileSync('test.wav', audioBuffer);
        console.log('Saved to test.wav');
        
        console.log('Testing ASR with the generated audio...');
        const formData = new FormData();
        formData.append('audio_file', fs.createReadStream('test.wav'));
        
        const asrRes = await fetch('http://localhost:3001/api/tools/transcribe', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            ...formData.getHeaders()
          },
          body: formData
        });
        
        console.log('ASR Status:', asrRes.status);
        const asrText = await asrRes.text();
        console.log('ASR Result:', asrText);
    } else {
        const errText = await ttsRes.text();
        console.log('TTS Error:', errText);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
