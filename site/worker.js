export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p.startsWith('/api/admin/')) return new Response('Not found', { status: 404 });
    if (p.startsWith('/api/') || p.startsWith('/photos/')) {
      const target = new URL(p + url.search, env.API_ORIGIN);
      const proxied = new Request(target, request);
      proxied.headers.set('X-Client-IP', request.headers.get('CF-Connecting-IP') || '');
      proxied.headers.set('X-Proxy-Secret', env.PROXY_SECRET);
      return fetch(proxied);
    }
    return env.ASSETS.fetch(request);
  },
};
