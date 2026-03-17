import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cssChunking: false,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
