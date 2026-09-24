/**
 * 驗證 Cloudflare Access 的登入憑證（JWT）。
 *
 * Access 擋在 /admin 前面，只有通過登入的人才會被放行，並附上一張簽過名的
 * JWT。這裡再自己驗一次簽章、對象（AUD）、簽發者與到期時間：就算 Access
 * 的規則設錯、或有人直接偽造標頭，沒有有效簽章的請求一樣進不來。
 */

const CERT_TTL_MS = 60 * 60 * 1000;
let certCache = { team: '', at: 0, keys: [] };

export async function verifyAccess(request, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const aud = String(env.ACCESS_AUD || '').trim();
  if (!team || !aud) return { error: 'not_configured' };

  const token = request.headers.get('Cf-Access-Jwt-Assertion') || readCookie(request, 'CF_Authorization');
  if (!token) return { error: 'unauthenticated' };

  const parts = token.split('.');
  if (parts.length !== 3) return { error: 'malformed' };
  let header, payload;
  try {
    header = JSON.parse(b64urlText(parts[0]));
    payload = JSON.parse(b64urlText(parts[1]));
  } catch (e) {
    return { error: 'malformed' };
  }
  if (header.alg !== 'RS256') return { error: 'bad_alg' };

  const key = await findKey(team, header.kid);
  if (!key) return { error: 'unknown_key' };
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!ok) return { error: 'bad_signature' };

  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return { error: 'bad_aud' };
  if (payload.iss !== 'https://' + team) return { error: 'bad_iss' };
  if (!payload.exp || payload.exp < now) return { error: 'expired' };
  if (payload.nbf && payload.nbf > now + 60) return { error: 'not_yet_valid' };
  return { email: payload.email || payload.sub || '' };
}

async function findKey(team, kid) {
  const fresh = certCache.team === team && Date.now() - certCache.at < CERT_TTL_MS;
  if (!fresh || !certCache.keys.some(k => k.kid === kid)) {
    const res = await fetch('https://' + team + '/cdn-cgi/access/certs');
    if (!res.ok) return null;
    const body = await res.json();
    const keys = [];
    for (const jwk of body.keys || []) {
      if (jwk.kty !== 'RSA') continue;
      const key = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
      );
      keys.push({ kid: jwk.kid, key });
    }
    certCache = { team, at: Date.now(), keys };
  }
  const hit = certCache.keys.find(k => k.kid === kid);
  return hit ? hit.key : null;
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

function b64urlBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function b64urlText(s) {
  return new TextDecoder().decode(b64urlBytes(s));
}
