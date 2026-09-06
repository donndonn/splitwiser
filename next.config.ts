import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SPLITWISER_VERIFY_DISTDIR || ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
