import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
