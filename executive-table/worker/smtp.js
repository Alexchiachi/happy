/**
 * 用 Gmail 寄信：透過 SMTP（smtp.gmail.com:465，加密連線）以你的 Gmail 帳號寄出。
 *
 * 需要 Gmail 的「應用程式密碼」（開啟兩步驟驗證後，在 Google 帳戶建立，16 個字母），
 * 存成 Cloudflare Secret GMAIL_APP_PASSWORD。信真的從 Google 寄出，寄件人就是你的
 * Gmail，不會被當成冒名信件。Gmail 一天約可寄 500 封。
 */
import { connect } from 'cloudflare:sockets';

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function sendSmtp(opts) {
  const {
    host = 'smtp.gmail.com', port = 465, secure = true,
    user, pass, fromName, to, replyTo, subject, html, text
  } = opts;
  const socket = connect({ hostname: host, port }, { secureTransport: secure ? 'on' : 'off' });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let buf = '';

  async function reply() {
    // 讀到最後一行（三位數字後面接空白）才算一個完整回應
    for (;;) {
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const out = lines.slice(0, i + 1).join('\n');
          buf = lines.slice(i + 1).join('\r\n');
          return { code: Number(lines[i].slice(0, 3)), text: out };
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('SMTP connection closed: ' + buf.slice(0, 200));
      buf += dec.decode(value, { stream: true });
    }
  }
  async function send(line) { await writer.write(enc.encode(line + '\r\n')); }
  async function expect(code, line) {
    if (line !== undefined) await send(line);
    const r = await reply();
    if (r.code !== code) throw new Error('SMTP ' + (line ? line.split(' ')[0] : 'greeting') + ' → ' + r.text.slice(0, 200));
    return r;
  }

  try {
    await expect(220);
    await expect(250, 'EHLO executive-table.workers.dev');
    await expect(235, 'AUTH PLAIN ' + b64(enc.encode('\0' + user + '\0' + pass)));
    await expect(250, 'MAIL FROM:<' + user + '>');
    await expect(250, 'RCPT TO:<' + to + '>');
    await expect(354, 'DATA');
    const message = buildMessage({ from: user, fromName, to, replyTo, subject, html, text });
    // 行首的句點要重複一次（dot-stuffing），最後以單獨一行句點結束
    await writer.write(enc.encode(message.replace(/\r\n\./g, '\r\n..') + '\r\n.\r\n'));
    await expect(250);
    await send('QUIT').catch(() => {});
  } finally {
    try { await writer.close(); } catch (e) {}
    try { socket.close(); } catch (e) {}
  }
}

export function buildMessage({ from, fromName, to, replyTo, subject, html, text }) {
  const boundary = 'b' + crypto.randomUUID().replace(/-/g, '');
  const domain = from.split('@')[1] || 'localhost';
  const headers = [
    'From: ' + (fromName ? encodeWord(fromName) + ' ' : '') + '<' + from + '>',
    'To: <' + to + '>',
    replyTo ? 'Reply-To: <' + replyTo + '>' : '',
    'Subject: ' + encodeWord(subject),
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomUUID() + '@' + domain + '>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"'
  ].filter(Boolean);
  const part = (type, body) => [
    '--' + boundary,
    'Content-Type: ' + type + '; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(enc.encode(body)))
  ].join('\r\n');
  return headers.join('\r\n') + '\r\n\r\n'
    + part('text/plain', text || '') + '\r\n'
    + part('text/html', html || '') + '\r\n'
    + '--' + boundary + '--';
}

// RFC 2047：中文主旨與名稱用 =?UTF-8?B?...?=，每段不超過 75 字元，不切斷字元
function encodeWord(s) {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words = [];
  let chunk = '';
  for (const ch of s) {
    if (enc.encode(chunk + ch).length > 45) { words.push(chunk); chunk = ''; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map(w => '=?UTF-8?B?' + b64(enc.encode(w)) + '?=').join('\r\n ');
}

function b64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function wrap(s) {
  return s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}
