import type { NextConfig } from "next";

const securityHeaders = [
  // Painel privado: nunca indexar nem arquivar.
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Páginas já visitadas reabrem na hora por 30s (preços seguem ao vivo via polling).
    staleTimes: { dynamic: 30, static: 300 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Motor de OCR local (arquivos estáticos versionados pelo pacote): cache longo no navegador.
      { source: "/ocr/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }] },
    ];
  },
};

export default nextConfig;
