export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return new Response('Cloudflare site worker placeholder', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
