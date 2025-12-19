/* Minimal endpoint smoke tests (non-auth) */
const targets = [
    { url: 'https://api.lanonasis.com/api/v1/health', allow: [200, 401, 403, 404] },
    { url: 'https://auth.lanonasis.com/health', allow: [200, 401, 403, 404] },
    { url: 'https://mcp.lanonasis.com/health', allow: [200, 401, 403, 404] },
    { url: 'https://v-secure.lanonasis.com', allow: [200, 401, 403, 404] },
    { url: 'https://mcp.lanonasis.com/ws', allow: [200, 401, 403, 404] },
    { url: 'https://mcp.lanonasis.com/api/v1/events', allow: [200, 401, 403, 404] },
    { url: 'https://docs.lanonasis.com', allow: [200, 301, 302, 304] },
    { url: 'https://dashboard.lanonasis.com', allow: [200, 301, 302, 304, 401, 403] },
  ];
  
  async function head(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      return res.status;
    } catch (e) {
      // Try GET fallback (some hosts do not support HEAD)
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal });
        return res.status;
      } catch (e2) {
        return 0;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  
  (async () => {
    const results = [];
    for (const t of targets) {
      const status = await head(t.url);
      const ok = t.allow.includes(status);
      results.push({ url: t.url, status, ok });
    }
    const failed = results.filter(r => !r.ok);
    for (const r of results) {
      console.log(`${r.ok ? 'OK ' : 'ERR'} ${r.status} ${r.url}`);
    }
    if (failed.length > 0) process.exit(1);
  })();
  
  
  