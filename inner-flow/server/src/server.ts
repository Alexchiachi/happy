/**
 * Inner Flow Assessment — AI 生成後端
 *
 *   GET  /api/health                        伺服器存活與目前掛載的模型
 *   POST /api/generate-breakthrough-report  生成《自洽躍遷破局手冊》（五章 + 寄語）
 *   POST /api/generate-meditation-audio     生成冥想導引詞與 WAV 語音
 *
 * 前端只呼叫這裡，API 金鑰永遠留在伺服器端。
 */
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { config } from './config.js';
import { generateWithFallback, textOf, audioOf, GeminiError } from './gemini.js';
import { reportPrompt, meditationPrompt, type AssessmentResult } from './prompts.js';
import { parseAssessment, ValidationError } from './validate.js';
import { rateLimit } from './rateLimit.js';
import { pcmToWav, sampleRateFromMimeType } from './wav.js';

export interface Chapter { title: string; body: string }
export interface BreakthroughReport { chapters: Chapter[]; message: string; model: string }

/** 模型偶爾會把 JSON 包在 ```json 圍欄裡；先剝掉再解析。 */
export function parseReportJson(raw: string): { chapters: Chapter[]; message: string } {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('模型回傳的內容不是 JSON');

  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
  const normalised = chapters
    .map((c) => c as Record<string, unknown>)
    .filter((c) => typeof c.title === 'string' && typeof c.body === 'string')
    .map((c) => ({ title: String(c.title), body: String(c.body) }));

  if (!normalised.length) throw new Error('模型回傳的 JSON 沒有任何章節');
  return { chapters: normalised, message: typeof parsed.message === 'string' ? parsed.message : '' };
}

async function buildReport(result: AssessmentResult): Promise<BreakthroughReport> {
  const { parts, model } = await generateWithFallback(
    [config.textModel, config.textModelFallback],
    {
      contents: [{ role: 'user', parts: [{ text: reportPrompt(result) }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    },
    (message) => console.warn('[gemini]', message),
  );
  return { ...parseReportJson(textOf(parts)), model };
}

async function buildMeditation(result: AssessmentResult): Promise<{ script: string; audio: { mimeType: string; base64: string } | null; model: string }> {
  // 第一段：導引詞（文字模型，含備援）
  const { parts, model } = await generateWithFallback(
    [config.textModel, config.textModelFallback],
    {
      contents: [{ role: 'user', parts: [{ text: meditationPrompt(result) }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
    },
    (message) => console.warn('[gemini]', message),
  );
  const script = textOf(parts);

  // 第二段：語音合成。回傳的是裸 PCM，必須自行補上 RIFF/WAVE 檔頭才能播放。
  const speech = await generateWithFallback([config.ttsModel], {
    contents: [{ role: 'user', parts: [{ text: script }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice } } },
    },
  });

  const inline = audioOf(speech.parts);
  if (!inline) return { script, audio: null, model };

  const wav = pcmToWav(Buffer.from(inline.data, 'base64'), {
    sampleRate: sampleRateFromMimeType(inline.mimeType, config.pcm.sampleRate),
    channels: config.pcm.channels,
    bitsPerSample: config.pcm.bitsPerSample,
  });

  return { script, audio: { mimeType: 'audio/wav', base64: wav.toString('base64') }, model };
}

/** 非同步路由的錯誤統一交給錯誤處理中介層。 */
const wrap = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '32kb' }));

  // CORS：允許名單留空時放行任何來源（僅適合本機開發）
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = config.allowedOrigins.length === 0 || (origin && config.allowedOrigins.includes(origin));
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(allowed ? 204 : 403); return; }
    if (!allowed) { res.status(403).json({ error: '來源未被允許' }); return; }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      apiKeyConfigured: Boolean(config.apiKey),   // 只回報有沒有設定，不回報內容
      models: {
        text: config.textModel,
        textFallback: config.textModelFallback,
        tts: config.ttsModel,
        voice: config.ttsVoice,
      },
    });
  });

  app.post('/api/generate-breakthrough-report', rateLimit, wrap(async (req, res) => {
    const result = parseAssessment(req.body);
    res.json(await buildReport(result));
  }));

  app.post('/api/generate-meditation-audio', rateLimit, wrap(async (req, res) => {
    const result = parseAssessment(req.body);
    res.json(await buildMeditation(result));
  }));

  app.use((_req, res) => { res.status(404).json({ error: '找不到這個端點' }); });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ValidationError) { res.status(400).json({ error: err.message }); return; }
    if (err instanceof GeminiError) {
      console.error('[gemini]', err.message);
      res.status(err.status === 504 ? 504 : 502).json({ error: '生成服務暫時無法回應，請稍後再試。' });
      return;
    }
    if (err instanceof SyntaxError) { res.status(400).json({ error: '請求內容不是有效的 JSON' }); return; }
    console.error('[server]', err);
    res.status(500).json({ error: '伺服器內部錯誤' });
  };
  app.use(onError);

  return app;
}
