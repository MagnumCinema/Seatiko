import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16.3+ with Turbopack skips next-server.js.nft.json when a build adapter
  // (Vercel's NEXT_ADAPTER_PATH) is active, so forcing standalone crashes post-build.
  // Keep standalone for Docker / self-hosted builds only.
  output: process.env.VERCEL || process.env.NEXT_ADAPTER_PATH ? undefined : "standalone",
  async rewrites() {
    // On Vercel Services, top-level rewrites in vercel.json route /api/*, /uploads/*, and /healthz directly.
    if (process.env.VERCEL) {
      return [];
    }
    const target = (process.env.API_INTERNAL_URL || "http://localhost:80").replace(/\/+$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${target}/uploads/:path*`,
      },
      {
        source: "/healthz",
        destination: `${target}/healthz`,
      },
    ];
  },
};

export default nextConfig;
