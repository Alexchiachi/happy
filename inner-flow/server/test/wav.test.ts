import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pcmToWav, sampleRateFromMimeType, WAV_HEADER_BYTES } from '../src/wav.js';

test('44 byte 檔頭的每個欄位都符合 RIFF/WAVE 規格', () => {
  const pcm = Buffer.alloc(960);                       // 24kHz、16bit、單聲道 = 20ms
  const wav = pcmToWav(pcm, { sampleRate: 24000, channels: 1, bitsPerSample: 16 });

  assert.equal(wav.length, WAV_HEADER_BYTES + pcm.length);
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wav.subarray(12, 16).toString('ascii'), 'fmt ');
  assert.equal(wav.readUInt32LE(16), 16);
  assert.equal(wav.readUInt16LE(20), 1);               // PCM
  assert.equal(wav.readUInt16LE(22), 1);               // 單聲道
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(28), 24000 * 2);       // byteRate = 取樣率 × 區塊對齊
  assert.equal(wav.readUInt16LE(32), 2);               // blockAlign = 聲道 × 位元深度 / 8
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.subarray(36, 40).toString('ascii'), 'data');
  assert.equal(wav.readUInt32LE(40), pcm.length);
});

test('立體聲與 24bit 的位元組率與區塊對齊', () => {
  const wav = pcmToWav(Buffer.alloc(12), { sampleRate: 48000, channels: 2, bitsPerSample: 24 });
  assert.equal(wav.readUInt16LE(32), 6);
  assert.equal(wav.readUInt32LE(28), 48000 * 6);
});

test('PCM 內容原封不動接在檔頭之後', () => {
  const pcm = Buffer.from([1, 2, 3, 4, 250, 251]);
  const wav = pcmToWav(pcm, { sampleRate: 24000, channels: 1, bitsPerSample: 16 });
  assert.deepEqual(wav.subarray(WAV_HEADER_BYTES), pcm);
});

test('不合法的格式直接拒絕，不產生壞檔', () => {
  assert.throws(() => pcmToWav(Buffer.alloc(2), { sampleRate: 0, channels: 1, bitsPerSample: 16 }), RangeError);
  assert.throws(() => pcmToWav(Buffer.alloc(2), { sampleRate: 24000, channels: 1, bitsPerSample: 12 }), RangeError);
});

test('從 Gemini 的 mimeType 取出取樣率，取不到才用預設值', () => {
  assert.equal(sampleRateFromMimeType('audio/L16;codec=pcm;rate=24000', 16000), 24000);
  assert.equal(sampleRateFromMimeType('audio/L16;codec=pcm', 16000), 16000);
  assert.equal(sampleRateFromMimeType(undefined, 22050), 22050);
});
