export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p.startsWith('/api/admin/')) return new Response('Not found', { status: 404 });
    if (p.startsWith('/api/') || p.startsWith('/photos/')) return env.API.fetch(request);
    const res = await env.ASSETS.fetch(request);
    if (url.hostname.endsWith('.workers.dev')) {
      const r = new Response(res.body, res);
      r.headers.set('X-Robots-Tag', 'noindex');
      return r;
    }
    return res;
  },
};
