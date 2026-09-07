import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp, parseReportJson } from '../src/server.js';
import { resetRateLimit } from '../src/rateLimit.js';

let server: Server;
let base: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });
beforeEach(() => { resetRateLimit(); });

const validBody = {
  archetype: '次生擾動型：思維反芻與情緒代謝延遲',
  band: '中高熵',
  entropy: 61,
  dimensions: { boundary: 33, flow: 33, work: 50 },
  bottleneck: '心智流動度',
};

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) as Record<string, unknown> | null };
}

test('GET /api/health 回報存活狀態與掛載的模型，但不外流金鑰', async () => {
  const res = await fetch(base + '/api/health');
  const body = await res.json() as Record<string, any>;
  assert.equal(res.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.models.text, 'string');
  assert.equal(typeof body.apiKeyConfigured, 'boolean');
  assert.equal(JSON.stringify(body).includes('AIza'), false);
});

test('缺少必填欄位時回 400，且不會呼叫模型', async () => {
  const { status, json } = await post('/api/generate-breakthrough-report', { entropy: 61 });
  assert.equal(status, 400);
  assert.match(String(json?.error), /archetype/);
});

test('分數超出 0–100 會被擋下', async () => {
  const { status, json } = await post('/api/generate-breakthrough-report', { ...validBody, entropy: 140 });
  assert.equal(status, 400);
  assert.match(String(json?.error), /entropy/);
});

test('壞掉的 JSON 回 400 而不是 500', async () => {
  const { status } = await post('/api/generate-meditation-audio', '{ not json');
  assert.equal(status, 400);
});

test('未知端點回 404 JSON', async () => {
  const res = await fetch(base + '/api/nope');
  assert.equal(res.status, 404);
});

test('超過流量上限回 429 並附 Retry-After', async () => {
  const requests = [];
  for (let i = 0; i < 12; i++) {
    requests.push(fetch(base + '/api/generate-breakthrough-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    }));
  }
  const results = await Promise.all(requests);
  const limited = results.filter((r) => r.status === 429);
  assert.ok(limited.length >= 2, `預期至少 2 個 429，實際 ${limited.length}`);
  assert.ok(limited[0]!.headers.get('Retry-After'));
});

test('模型把 JSON 包在 ``` 圍欄裡也能解析', () => {
  const raw = '```json\n{"chapters":[{"title":"一","body":"內文"}],"message":"寄語"}\n```';
  const parsed = parseReportJson(raw);
  assert.equal(parsed.chapters.length, 1);
  assert.equal(parsed.chapters[0]!.title, '一');
  assert.equal(parsed.message, '寄語');
});

test('沒有章節的回應視為失敗，不會回傳空手冊', () => {
  assert.throws(() => parseReportJson('{"chapters":[]}'), /沒有任何章節/);
  assert.throws(() => parseReportJson('抱歉，我無法回答'), /不是 JSON/);
});
