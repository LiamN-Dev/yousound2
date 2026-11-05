export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only serve static game files from this Worker.
    // The YouSound app, API, authentication, and Supabase remain separate.
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("YouSound game asset host is online.", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);

    if (response.ok) {
      headers.set("cache-control", "public, max-age=31536000, immutable");
      headers.set("x-content-type-options", "nosniff");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
