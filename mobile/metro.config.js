const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/**
 * Web dev proxy: in browser the app talks same-origin (EXPO_PUBLIC_API_URL=""),
 * so /api requests hit the Metro dev server. Forward them to a dineros backend
 * to sidestep browser CORS — the native apps are unaffected (they call the API
 * directly via an absolute EXPO_PUBLIC_API_URL).
 *
 * DINEROS_API_PROXY defaults to the local dev server; e.g.:
 *   DINEROS_API_PROXY=https://staging.dineros.cc pnpm --filter dineros-mobile web
 */
const PROXY_TARGET = process.env.DINEROS_API_PROXY || "http://localhost:3102";

if (__DEV__) {
  const target = new URL(PROXY_TARGET);
  const httpLib = target.protocol === "https:" ? require("https") : require("http");

  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware) => (req, res, next) => {
      if (req.url && req.url.startsWith("/api")) {
        const upstream = httpLib.request(
          {
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || (target.protocol === "https:" ? 443 : 80),
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: target.host },
          },
          (upstreamRes) => {
            res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
            upstreamRes.pipe(res);
          },
        );
        upstream.on("error", () => {
          res.statusCode = 502;
          res.end(JSON.stringify({ message: "API proxy error (is the backend running?)" }));
        });
        req.pipe(upstream);
        return;
      }
      return middleware(req, res, next);
    },
  };
}

module.exports = config;
