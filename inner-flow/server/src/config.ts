/** 環境設定：集中在一處，方便 /api/health 回報目前掛載了什麼。 */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  apiKey: process.env.GEMINI_API_KEY ?? '',

  // 端點可覆寫：測試時指向本機替身，正式環境也可換成自架代理
  apiBase: process.env.GEMINI_API_BASE ?? 'https://generativelanguage.googleapis.com/v1beta/models',

  // 預設值取自系統規格書。不同帳號可用的模型不同，因此一律可由環境變數覆寫，
  // 並由 /api/health 回報，避免部署後才發現模型名稱不存在。
  textModel: process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.6-flash',
  textModelFallback: process.env.GEMINI_TEXT_MODEL_FALLBACK ?? 'gemini-3.7-flash',
  ttsModel: process.env.GEMINI_TTS_MODEL ?? 'gemini-3.1-flash-tts-preview',
  ttsVoice: process.env.GEMINI_TTS_VOICE ?? 'Aoede',

  pcm: {
    sampleRate: Number(process.env.TTS_SAMPLE_RATE ?? 24000),
    channels: Number(process.env.TTS_CHANNELS ?? 1),
    bitsPerSample: Number(process.env.TTS_BITS_PER_SAMPLE ?? 16),
  },

  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX ?? 10),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
  },

  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 90_000),
} as const;
