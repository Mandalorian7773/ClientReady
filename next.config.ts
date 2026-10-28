import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build run alongside `next dev` without clobbering .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Hide the Next.js "N" badge in development, so it can't appear in demo recordings.
  devIndicators: false,
};

export default nextConfig;
