/**
 * 寄信：有 Gmail 應用程式密碼就用 Gmail（smtp.js），否則用 Resend（選用）。
 * 回傳一段寄送結果文字，存進資料庫給管理頁看（sent / skipped: … / failed: …）。
 */
import { sendSmtp } from './smtp.js';

export async function sendMail(env, msg) {
  if (!msg.to) return 'skipped: no recipient';
  // msg.gmail 可指定另一個 Gmail 帳號寄出（例如大道至簡的信箱）；沒有就用主要的 Gmail
  const gmailPass = (msg.gmail && msg.gmail.pass) || env.GMAIL_APP_PASSWORD;
  if (gmailPass) {
    try {
      await sendSmtp({
        host: env.SMTP_HOST || undefined,
        port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
        secure: env.SMTP_SECURE !== 'off',
        user: (msg.gmail && msg.gmail.pass && msg.gmail.user) || env.GMAIL_USER || env.NOTIFY_EMAIL,
        pass: String(gmailPass).replace(/\s+/g, ''),
        fromName: msg.fromName || env.MAIL_FROM_NAME || '簡家旗｜幸福餐桌',
        to: msg.to, replyTo: msg.replyTo, subject: msg.subject, html: msg.html, text: msg.text
      });
      return 'sent';
    } catch (err) {
      return 'failed: ' + String(err && err.message || err).slice(0, 200);
    }
  }
  if (!env.RESEND_API_KEY) return 'skipped: no mail service (set GMAIL_APP_PASSWORD)';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [msg.to],
        reply_to: msg.replyTo || undefined,
        subject: msg.subject,
        html: msg.html,
        text: msg.text
      })
    });
    if (res.ok) return 'sent';
    return 'failed ' + res.status + ': ' + (await res.text()).slice(0, 200);
  } catch (err) {
    return 'failed: ' + String(err).slice(0, 200);
  }
}
