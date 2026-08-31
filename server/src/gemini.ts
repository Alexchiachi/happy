/** Gemini REST 用戶端：只用 fetch，不綁 SDK 版本。 */
import { config } from './config.js';

const ENDPOINT = () => config.apiBase;

export class GeminiError extends Error {
  constructor(message: string, readonly status: number, readonly model: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

export interface GeminiPart { text?: string; inlineData?: { mimeType: string; data: string } }
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  promptFeedback?: { blockReason?: string };
}

/** 呼叫 generateContent；逾時、非 2xx、被安全機制擋下都會丟出 GeminiError。 */
export async function generateContent(model: string, body: unknown): Promise<GeminiPart[]> {
  if (!config.apiKey) throw new GeminiError('缺少 GEMINI_API_KEY', 500, model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const res = await fetch(`${ENDPOINT()}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 錯誤內文可能帶有請求細節，只保留狀態碼與訊息，不外流金鑰
      const detail = await res.text().catch(() => '');
      throw new GeminiError(`模型 ${model} 回應 ${res.status}：${detail.slice(0, 300)}`, res.status, model);
    }

    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) {
      throw new GeminiError(`內容被安全機制擋下：${data.promptFeedback.blockReason}`, 422, model);
    }

    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts?.length) throw new GeminiError(`模型 ${model} 沒有回傳內容`, 502, model);
    return parts;
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new GeminiError(`模型 ${model} 逾時（${config.requestTimeoutMs}ms）`, 504, model);
    }
    throw new GeminiError(`呼叫模型 ${model} 失敗：${(err as Error).message}`, 502, model);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 主模型失敗時自動改用備援模型。
 * 只在「值得重試」的錯誤上退避——被安全機制擋下（422）換模型也是一樣的結果。
 */
export async function generateWithFallback(
  models: readonly string[],
  body: unknown,
  log: (message: string) => void = () => {},
): Promise<{ parts: GeminiPart[]; model: string }> {
  let lastError: unknown;
  for (const model of models) {
    try {
      return { parts: await generateContent(model, body), model };
    } catch (err) {
      lastError = err;
      if (err instanceof GeminiError && err.status === 422) throw err;
      log(`模型 ${model} 失敗，改用下一個備援：${(err as Error).message}`);
    }
  }
  throw lastError;
}

/** 把回傳的各段文字接起來。 */
export function textOf(parts: GeminiPart[]): string {
  return parts.map((p) => p.text ?? '').join('').trim();
}

/** 取出第一段音訊（inlineData）。 */
export function audioOf(parts: GeminiPart[]): { mimeType: string; data: string } | null {
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData;
  }
  return null;
}
