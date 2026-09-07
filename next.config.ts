import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Results come either from a backend's own CDN or from our /api/images route,
  // so there is nothing for the optimizer to do and no allowlist to maintain.
  images: { unoptimized: true },
};

export default nextConfig;
