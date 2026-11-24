/** 預約表單與大道至簡來信共用的小工具。 */

// 只存雜湊，用來擋短時間大量送出；不保存訪客的 IP
export async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('executive-table:' + ip));
  return [...new Uint8Array(buf)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 經過自家網站 Worker 轉送時，訪客 IP 放在 X-Client-IP；
// 只有帶著正確 X-Proxy-Secret 的請求才採信，其他一律用 CF-Connecting-IP。
export function clientIp(request, env) {
  const secret = env.PROXY_SECRET;
  if (secret && request.headers.get('X-Proxy-Secret') === secret) {
    return request.headers.get('X-Client-IP') || '';
  }
  return request.headers.get('CF-Connecting-IP') || '';
}

export function formatTaipei(sqlUtc) {
  const d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
