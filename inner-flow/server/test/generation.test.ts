/**
 * 以本機的 Gemini 替身驗證兩條完整鏈路：
 *   1. 主模型失敗 → 自動改用備援模型 → 手冊仍然生成
 *   2. TTS 回傳裸 PCM → 後端補上 44 byte 檔頭 → 前端拿到可播放的 WAV
 * 這兩段是真正會壞掉的地方，而且不需要真的 API 金鑰就能測。
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.GEMINI_API_KEY = 'test-key';
process.env.RATE_LIMIT_MAX = '100';

const calls: string[] = [];
let fake: Server;

/** 模仿 generateContent：主模型一律 503，備援與 TTS 正常回應。 */
before(async () => {
  fake = http.createServer((req, res) => {
    const model = decodeURIComponent((req.url ?? '').split('/').pop()!.replace(':generateContent', ''));
    calls.push(model);
    res.setHeader('Content-Type', 'application/json');

    if (model === 'primary-model') {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: { message: 'model overloaded' } }));
      return;
    }
    if (model === 'tts-model') {
      const pcm = Buffer.alloc(480, 7);                       // 10ms 的假音訊
      res.end(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }],
      }));
      return;
    }
    const text = req.url?.includes('fallback')
      ? '{"chapters":[{"title":"你此刻的系統狀態","body":"內文"}],"message":"寄語"}'
      : '';
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  });
  fake.listen(0);
  await new Promise((resolve) => fake.once('listening', resolve));
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/models`;
  process.env.GEMINI_TEXT_MODEL = 'primary-model';
  process.env.GEMINI_TEXT_MODEL_FALLBACK = 'fallback-model';
  process.env.GEMINI_TTS_MODEL = 'tts-model';
});
after(() => { fake.close(); });
beforeEach(() => { calls.length = 0; });

const body = {
  archetype: '完美主義凍結型：全有全無與行動癱瘓',
  band: '中等熵',
  entropy: 39,
  dimensions: { boundary: 83, flow: 67, work: 33 },
  bottleneck: '有效做功能力',
};

async function callApi(path: string) {
  const { createApp } = await import('../src/server.js');
  const { resetRateLimit } = await import('../src/rateLimit.js');
  resetRateLimit();
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() as Record<string, any> };
  } finally {
    server.close();
  }
}

test('主模型失效時自動退到備援模型，手冊照樣生成', async () => {
  const { status, json } = await callApi('/api/generate-breakthrough-report');
  assert.equal(status, 200);
  assert.deepEqual(calls, ['primary-model', 'fallback-model']);
  assert.equal(json.model, 'fallback-model');
  assert.equal(json.chapters[0].title, '你此刻的系統狀態');
  assert.equal(json.message, '寄語');
});

test('裸 PCM 被封裝成可播放的 WAV：檔頭、取樣率與長度都正確', async () => {
  const { status, json } = await callApi('/api/generate-meditation-audio');
  assert.equal(status, 200);
  assert.equal(json.audio.mimeType, 'audio/wav');

  const wav = Buffer.from(json.audio.base64, 'base64');
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 24000);        // 取樣率取自回傳的 mimeType
  assert.equal(wav.readUInt32LE(40), 480);          // data 區塊長度 = 原始 PCM 長度
  assert.equal(wav.length, 44 + 480);
});
