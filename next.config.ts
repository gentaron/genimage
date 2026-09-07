import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Image bytes are streamed from our own /api/images route, so the built-in
  // optimizer is unnecessary and would only add a second copy on disk.
  images: { unoptimized: true },
};

export default nextConfig;
