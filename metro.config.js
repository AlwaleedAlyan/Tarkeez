const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("sql");
config.resolver.assetExts.push("wasm");

// SharedArrayBuffer (required by expo-sqlite's WASM web build) is only
// exposed by browsers when the page is served with these two headers.
// Native runtimes ignore them.
const CROSS_ORIGIN_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

config.server = config.server ?? {};
const prevEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const enhanced = prevEnhance ? prevEnhance(middleware, server) : middleware;
  return (req, res, next) => {
    for (const [k, v] of Object.entries(CROSS_ORIGIN_HEADERS)) {
      res.setHeader(k, v);
    }
    return enhanced(req, res, next);
  };
};

module.exports = config;
