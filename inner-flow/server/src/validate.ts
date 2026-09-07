/** 請求驗證：只接受形狀正確的評估結果，避免把垃圾送進模型（每次生成都要花錢）。 */
import type { AssessmentResult } from './prompts.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function score(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError(`${field} 必須是 0 到 100 之間的數字`);
  }
  return Math.round(n);
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} 為必填`);
  if (value.length > maxLength) throw new ValidationError(`${field} 過長（上限 ${maxLength} 字）`);
  return value.trim();
}

export function parseAssessment(body: unknown): AssessmentResult {
  if (typeof body !== 'object' || body === null) throw new ValidationError('請求內容必須是 JSON 物件');
  const raw = body as Record<string, unknown>;
  const dimensions = (raw.dimensions ?? {}) as Record<string, unknown>;

  return {
    archetype: text(raw.archetype, 'archetype', 80),
    band: text(raw.band ?? '未標示', 'band', 40),
    entropy: score(raw.entropy, 'entropy'),
    dimensions: {
      boundary: score(dimensions.boundary, 'dimensions.boundary'),
      flow: score(dimensions.flow, 'dimensions.flow'),
      work: score(dimensions.work, 'dimensions.work'),
    },
    bottleneck: text(raw.bottleneck ?? '無明顯瓶頸', 'bottleneck', 40),
  };
}
