/**
 * 極簡的記憶體型流量限制：每次生成都會產生模型費用，因此預設就要有上限。
 * 單一執行個體足夠；若要水平擴充，換成 Redis 之類的共享儲存。
 */
import type { RequestHandler } from 'express';
import { config } from './config.js';

const hits = new Map<string, number[]>();

export const rateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const key = req.ip ?? 'unknown';
  const window = (hits.get(key) ?? []).filter((t) => now - t < config.rateLimit.windowMs);

  if (window.length >= config.rateLimit.max) {
    const retryAfter = Math.ceil((config.rateLimit.windowMs - (now - (window[0] ?? now))) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: '生成次數已達上限，請稍後再試。', retryAfter });
    return;
  }

  window.push(now);
  hits.set(key, window);

  // 順手清掉早已過期的紀錄，避免長時間執行後 Map 無限成長
  if (hits.size > 5000) {
    for (const [ip, times] of hits) {
      if (times.every((t) => now - t >= config.rateLimit.windowMs)) hits.delete(ip);
    }
  }
  next();
};

/** 測試用：清空計數。 */
export function resetRateLimit(): void {
  hits.clear();
}
