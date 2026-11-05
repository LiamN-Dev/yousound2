export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "access-control-max-age": "86400"
        }
      });
    }

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
    headers.set("access-control-allow-origin", "*");
    headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
    headers.set("x-content-type-options", "nosniff");

    if (response.ok) {
      const contentType = headers.get("content-type") || "";
      const filename = url.pathname.split("/").pop() || "";
      const fingerprinted = /[.-][a-f0-9]{8,}[.-]/i.test(filename);
      if (contentType.includes("text/html") || url.pathname.endsWith("/")) {
        headers.set("cache-control", "no-store");
      } else if (fingerprinted) {
        headers.set("cache-control", "public, max-age=31536000, immutable");
      } else {
        headers.set("cache-control", "public, max-age=86400");
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
