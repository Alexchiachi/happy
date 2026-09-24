/**
 * Gemini 的語音端點回傳的是「裸」PCM（沒有任何檔頭），瀏覽器的 <audio> 無法直接播放。
 * 這裡替它補上標準的 44 byte RIFF/WAVE 檔頭，封裝成可直接播放的 WAV。
 *
 * 檔頭配置（小端序）：
 *   0  "RIFF"        4  檔案長度 - 8      8  "WAVE"
 *   12 "fmt "       16  子區塊長度 16     20  格式 1 = PCM
 *   22 聲道數       24  取樣率           28  位元組率
 *   32 區塊對齊     34  位元深度         36  "data"      40  資料長度
 */
export interface PcmFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export const WAV_HEADER_BYTES = 44;

export function pcmToWav(pcm: Buffer, format: PcmFormat): Buffer {
  const { sampleRate, channels, bitsPerSample } = format;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate 必須為正數');
  if (!Number.isFinite(channels) || channels <= 0) throw new RangeError('channels 必須為正數');
  if (![8, 16, 24, 32].includes(bitsPerSample)) throw new RangeError('bitsPerSample 必須是 8/16/24/32');

  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(WAV_HEADER_BYTES);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);          // 之後所有位元組數
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);                      // PCM 的 fmt 區塊固定 16 byte
  header.writeUInt16LE(1, 20);                       // 1 = 未壓縮 PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** Gemini 回傳的 mimeType 形如 `audio/L16;codec=pcm;rate=24000`，能取到取樣率就用它的。 */
export function sampleRateFromMimeType(mimeType: string | undefined, fallback: number): number {
  const match = /rate=(\d+)/.exec(mimeType ?? '');
  const parsed = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
